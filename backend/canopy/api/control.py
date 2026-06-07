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
import random
import re
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from canopy.agents.skills import SPECIALIST_PROFILES
from canopy.agents.strategies import (
    Generalist,
    Lowballer,
    Manager,
    Premium,
    Specialist,
    Undercutter,
)
from canopy.agents.worker import Worker
from canopy.api.state import PENDING_ACTION_KEY as PENDING_KEY
from canopy.config import settings
from canopy.jobs.schema import Job
from canopy.market import events, ledger, matching, registry
from canopy.redis_client import get_redis
from canopy.sim import shock
from canopy.sim.engine import ensure_market

router = APIRouter(prefix="/control")

def spawn(coro, label: str) -> asyncio.Task:
    """create_task with a crash logger — background failures must be visible."""
    task = asyncio.create_task(coro)

    def _done(t: asyncio.Task) -> None:
        if not t.cancelled() and t.exception() is not None:
            print(f"[canopy] background task '{label}' failed: {t.exception()!r}")

    task.add_done_callback(_done)
    return task


CUSTOM_AGENTS_SET = "agents:custom"

STRATEGY_REGISTRY = {
    cls.name: cls for cls in (Generalist, Undercutter, Premium, Specialist, Manager, Lowballer)
}

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
    spawn(market.run_job(job), f"post_job {job.id}")
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

    spawn(run_burst(), "demand_spike")
    return {"status": "spiking", "jobs": body.jobs, "category": body.category}


class ReserveRequest(BaseModel):
    price: float


@router.post("/reserve")
async def set_reserve(body: ReserveRequest):
    settings.reserve_price = max(0.0, body.price)
    await events.emit("reserve_price", {"price": settings.reserve_price})
    return {"status": "ok", "reserve_price": settings.reserve_price}


class PauseRequest(BaseModel):
    paused: bool


@router.post("/pause")
async def pause(body: PauseRequest):
    """Freeze the simulation — in-flight jobs finish, no new ones post."""
    r = get_redis()
    if body.paused:
        await r.set("market:paused", "1")
    else:
        await r.delete("market:paused")
    await events.emit("paused" if body.paused else "resumed", {})
    return {"status": "paused" if body.paused else "running"}


# --- Arena: human-fielded OpenRouter agents ------------------------------------


class CustomAgentRequest(BaseModel):
    name: str
    model: str  # OpenRouter catalog id, e.g. anthropic/claude-haiku-4.5
    strategy: str = "generalist"
    stake: float = 100.0


@router.post("/register_custom_agent")
async def register_custom_agent(body: CustomAgentRequest):
    if not settings.openrouter_api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_API_KEY not configured — the Arena is offline",
        )
    r = get_redis()
    if await r.scard(CUSTOM_AGENTS_SET) >= settings.max_custom_agents:
        raise HTTPException(
            status_code=503,
            detail=f"arena full — max {settings.max_custom_agents} fielded agents",
        )
    strategy_cls = STRATEGY_REGISTRY.get(body.strategy.lower())
    if strategy_cls is None:
        raise HTTPException(
            status_code=400,
            detail=f"unknown strategy '{body.strategy}' — one of {sorted(STRATEGY_REGISTRY)}",
        )
    if not (settings.custom_stake_min <= body.stake <= settings.custom_stake_max):
        raise HTTPException(
            status_code=400,
            detail=f"stake must be {settings.custom_stake_min}–{settings.custom_stake_max}",
        )
    if "/" not in body.model:
        raise HTTPException(
            status_code=400, detail="model must be an OpenRouter id (org/model)"
        )

    # slugified, visually distinct in the graph
    name = re.sub(r"[^a-z0-9-]+", "-", body.name.lower()).strip("-") or "agent"
    if not name.startswith("you-"):
        name = f"you-{name}"

    market = await ensure_market()
    if name in market.workers:
        raise HTTPException(status_code=409, detail=f"agent '{name}' already fielded")

    rng = random.Random(settings.rng_seed + await r.incr("market:custom_counter"))
    niche: str | None = None
    if strategy_cls is Specialist:
        niche = rng.choice(sorted(SPECIALIST_PROFILES))
        strategy = Specialist(rng, niche)
    else:
        strategy = strategy_cls(rng)

    worker = Worker(name, strategy=strategy, model=body.model)
    worker.market = market
    worker.skill_text = (
        SPECIALIST_PROFILES[niche]
        if niche
        else f"Human-fielded challenger agent running {body.model}. "
        "Competes on any topic, any category."
    )
    market.workers[name] = worker
    await registry.register_agent(
        name, name, worker.display_tier, strategy.name, balance=body.stake,
        label=f"{body.model} — fielded by you", model=body.model,
    )
    await r.sadd(CUSTOM_AGENTS_SET, name)
    await matching.index_agent_skills(name, worker.skill_text)
    # mid-run join: open jobs in the book → a scenario is live and the very
    # next auction (run_job reads actives fresh) will include this agent
    mid_run = bool(await r.zcard("jobs:open"))
    await events.emit(
        "agent_registered",
        {
            "agent_id": name,
            "name": name,
            "model": body.model,
            "model_tier": worker.display_tier,
            "strategy": strategy.name,
            "custom": True,
            "mid_run": mid_run,
            "stake": body.stake,
            **({"niche": niche} if niche else {}),
        },
    )
    return {"status": "fielded", "agent_id": name, "model": body.model, "mid_run": mid_run, "niche": niche}


@router.delete("/custom_agents")
async def remove_custom_agents():
    """Kill switch: drain and deregister every human-fielded agent."""
    r = get_redis()
    market = await ensure_market()
    removed = []
    for agent_id in sorted(await r.smembers(CUSTOM_AGENTS_SET)):
        await r.hset(f"agent:{agent_id}", "status", "retired")
        await r.srem(registry.AGENTS_SET, agent_id)
        await r.srem(CUSTOM_AGENTS_SET, agent_id)
        await matching.remove_agent_skills(agent_id)
        market.workers.pop(agent_id, None)
        removed.append(agent_id)
    if removed:
        await events.emit("custom_agents_removed", {"agents": removed})
    return {"status": "removed", "agents": removed}


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
