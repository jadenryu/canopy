"""REST control surface — trigger/inspect scenario runs.

POST /sim/run launches the market scenario as a background task; the
UI watches it arrive through the AG-UI stream (it never polls REST for
state). Phase 5 adds the HITL ControlPanel actions on top.
"""
import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from canopy.sim.engine import run_scenario

router = APIRouter()

_task: asyncio.Task | None = None


class SimRunRequest(BaseModel):
    jobs: int = 13
    mock: bool = False
    sabotage: bool = True
    job_delay: float = 1.0  # pacing so the trading floor is watchable


@router.post("/sim/run")
async def sim_run(body: SimRunRequest):
    global _task
    if _task is not None and not _task.done():
        raise HTTPException(status_code=409, detail="a scenario is already running")
    _task = asyncio.create_task(
        run_scenario(
            n_jobs=body.jobs,
            mock=body.mock,
            sabotage=body.sabotage,
            job_delay=body.job_delay,
        )
    )
    return {"status": "started", "jobs": body.jobs, "mock": body.mock}


@router.get("/sim/status")
async def sim_status():
    if _task is None:
        return {"state": "idle"}
    if not _task.done():
        return {"state": "running"}
    if _task.exception() is not None:
        return {"state": "failed", "error": str(_task.exception())}
    return {"state": "finished"}
