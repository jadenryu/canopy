"""HITL ControlPanel endpoints — the human steers the market.

Low-impact actions (post a job, demand spike, reserve price) execute
immediately. HIGH-IMPACT actions (kill the top agent, inject liquidity)
go through an AG-UI approval loop: the request lands in shared state as
`pending_action`, the human approves/rejects in the UI, and nothing
executes until approval arrives. The approval itself travels over the
same AG-UI connection as everything else.
"""
import asyncio
import json
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from canopy.api.state import PENDING_ACTION_KEY as PENDING_KEY
from canopy.config import settings
from canopy.jobs.schema import Job
from canopy.market import events, ledger, registry
from canopy.redis_client import get_redis
from canopy.sim import shock
from canopy.sim.engine import ensure_market

router = APIRouter(prefix="/control")

HIGH_IMPACT = {
    "kill_top_agent": "Force-bankrupt the market's top agent (the shock)",
    "inject_liquidity": "Central bank: credit every active agent",
}


# --- low-impact: execute immediately -----------------------------------------


class PostJobRequest(BaseModel):
    spec: str
    category: str = "general"
    bounty_cap: float = 10.0
    complex_job: bool = False  # 3-hop → managers may decompose it


@router.post("/post_job")
async def post_job(body: PostJobRequest):
    market = await ensure_market()
    r = get_redis()
    seq = await r.incr("market:job_counter")
    job = Job(
        id=f"job-h{seq:03d}",
        spec=body.spec,
        category=body.category,
        hops=3 if body.complex_job else 2,
        bounty_cap=body.bounty_cap * (1.5 if body.complex_job else 1.0),
        client_id="human",
    )
    asyncio.create_task(market.run_job(job))
    return {"status": "posted", "job_id": job.id}


class SpikeRequest(BaseModel):
    category: str | None = None
    jobs: int = 5


@router.post("/demand_spike")
async def demand_spike(body: SpikeRequest):
    market = await ensure_market()

    async def run_burst():
        # STAGGERED burst: job N+1's auction runs while job N's winner is
        # still executing (busy → surge pricing) → the clearing price
        # visibly jumps, then heals as the queue drains
        jobs = await shock.spike_jobs(body.category, body.jobs)
        tasks = []
        for job in jobs:
            tasks.append(asyncio.create_task(market.run_job(job)))
            await asyncio.sleep(settings.spike_stagger)
        await asyncio.gather(*tasks)

    asyncio.create_task(run_burst())
    return {"status": "spiking", "jobs": body.jobs, "category": body.category}


class ReserveRequest(BaseModel):
    price: float


@router.post("/reserve")
async def set_reserve(body: ReserveRequest):
    settings.reserve_price = max(0.0, body.price)
    await events.emit("reserve_price", {"price": settings.reserve_price})
    return {"status": "ok", "reserve_price": settings.reserve_price}


# --- high-impact: AG-UI approval loop -----------------------------------------


class ActionRequest(BaseModel):
    kind: str  # kill_top_agent | inject_liquidity
    amount: float = 50.0  # liquidity only


@router.post("/request_action")
async def request_action(body: ActionRequest):
    if body.kind not in HIGH_IMPACT:
        raise HTTPException(status_code=400, detail=f"unknown action {body.kind}")
    r = get_redis()
    if await r.get(PENDING_KEY):
        raise HTTPException(status_code=409, detail="an action is already pending approval")
    action = {
        "id": str(uuid.uuid4())[:8],
        "kind": body.kind,
        "label": HIGH_IMPACT[body.kind],
        "params": {"amount": body.amount} if body.kind == "inject_liquidity" else {},
    }
    await r.set(PENDING_KEY, json.dumps(action))
    await events.emit("approval_required", action)
    return {"status": "pending_approval", "action": action}


class ApprovalRequest(BaseModel):
    action_id: str
    approve: bool


@router.post("/approve")
async def approve(body: ApprovalRequest):
    r = get_redis()
    raw = await r.get(PENDING_KEY)
    if not raw:
        raise HTTPException(status_code=404, detail="no pending action")
    action = json.loads(raw)
    if action["id"] != body.action_id:
        raise HTTPException(status_code=409, detail="action id mismatch")
    await r.delete(PENDING_KEY)
    await events.emit(
        "approval_resolved", {**action, "approved": body.approve}
    )
    if not body.approve:
        return {"status": "rejected", "action": action}

    await ensure_market()
    if action["kind"] == "kill_top_agent":
        target = await kill_and_report()
        return {"status": "executed", "killed": target}
    if action["kind"] == "inject_liquidity":
        amount = float(action["params"].get("amount", 50.0))
        for agent_id in await registry.active_agent_ids():
            await ledger.credit(agent_id, amount)
            await ledger.record("central-bank", agent_id, amount, "", "liquidity")
        await events.emit("liquidity", {"amount": amount})
        return {"status": "executed", "amount": amount}
    raise HTTPException(status_code=400, detail="unknown action kind")


async def kill_and_report() -> str | None:
    return await shock.kill_top_agent()
