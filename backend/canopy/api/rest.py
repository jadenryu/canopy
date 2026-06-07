"""REST control surface — trigger/inspect scenario runs.

POST /sim/run launches the market scenario as a background task; the
UI watches it arrive through the AG-UI stream (it never polls REST for
state). A run can use a named preset, or a fully custom fleet roster.
"""
import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from canopy.config import settings
from canopy.market import events
from canopy.sim.engine import emergence_spec, model_battle_spec, reset_market, run_scenario

router = APIRouter()

_task: asyncio.Task | None = None


class FleetMember(BaseModel):
    model: str  # house id (gpt-5.4-nano) or OpenRouter id (org/model)
    strategy: str = "generalist"
    stake: float | None = None
    category: str | None = None  # for specialist strategy
    label: str | None = None


class SimRunRequest(BaseModel):
    jobs: int = 13
    mock: bool = False
    sabotage: bool = True
    job_delay: float = 1.0  # pacing so the trading floor is watchable
    preset: str = "emergence"  # emergence | model_battle | custom
    fleet: list[FleetMember] | None = None  # required when preset == "custom"


def _resolve_fleet(body: SimRunRequest) -> list[dict] | None:
    if body.preset == "model_battle":
        return model_battle_spec()
    if body.preset == "custom":
        if not body.fleet:
            raise HTTPException(status_code=400, detail="custom preset needs a fleet")
        if any("/" in m.model and not settings.openrouter_api_key for m in body.fleet):
            raise HTTPException(
                status_code=503, detail="OPENROUTER_API_KEY required for non-house models"
            )
        return [m.model_dump(exclude_none=True) for m in body.fleet]
    return None  # emergence preset → engine default


def _on_done(task: asyncio.Task) -> None:
    """A scenario task that dies (bad fleet, OpenRouter outage, Redis blip)
    must not fail silently — log it and surface it on the event bus."""
    if task.cancelled() or task.exception() is None:
        return
    exc = task.exception()
    print(f"[canopy] scenario failed: {exc!r}")
    asyncio.create_task(events.emit("scenario_failed", {"error": str(exc) or repr(exc)}))


@router.post("/sim/run")
async def sim_run(body: SimRunRequest):
    global _task
    if _task is not None and not _task.done():
        raise HTTPException(status_code=409, detail="a scenario is already running")
    fleet_spec = _resolve_fleet(body)
    _task = asyncio.create_task(
        run_scenario(
            n_jobs=body.jobs,
            mock=body.mock,
            sabotage=body.sabotage,
            job_delay=body.job_delay,
            fleet_spec=fleet_spec,
        )
    )
    _task.add_done_callback(_on_done)
    return {"status": "started", "jobs": body.jobs, "preset": body.preset}


@router.post("/sim/reset")
async def sim_reset():
    """Wipe the board back to an empty market. Cancels any in-flight
    scenario first, then does the same scoped key wipe every run starts
    with — so a reset and a fresh run leave Redis in identical states.
    The market_reset event (emitted AFTER the wipe, so it's the only
    entry in the fresh events stream) nudges the AG-UI bridge into
    pushing an empty snapshot to every connected client."""
    global _task
    cancelled = False
    if _task is not None and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            cancelled = True
    _task = None
    await reset_market()
    await events.emit("market_reset", {"cancelled_run": cancelled})
    return {"status": "reset", "cancelled_run": cancelled}


@router.get("/sim/presets")
async def sim_presets():
    """What the fleet configurator offers: named presets + selectable models
    and strategies for custom builds."""
    house = [settings.worker_model_cheap, settings.worker_model_premium]
    openrouter = [
        "openai/gpt-4o-mini",
        "anthropic/claude-haiku-4.5",
        "google/gemini-2.5-flash",
        "meta-llama/llama-3.1-8b-instruct",
        "mistralai/mistral-small-3.1",
    ]
    return {
        "presets": [
            {
                "id": "emergence",
                "name": "Emergence (house fleet)",
                "blurb": "Specialists, generalists, a manager and bad actors on one model — produces specialization, subcontracting, fraud and bankruptcy.",
            },
            {
                "id": "model_battle",
                "name": "Model battle",
                "blurb": "Different models, all generalist — wins attribute to the MODEL, not a specialty. Which model competes best in a live economy?",
            },
            {"id": "custom", "name": "Custom fleet", "blurb": "Pick the exact roster of models and strategies."},
        ],
        "models": {
            "house": house,
            "openrouter": openrouter if settings.openrouter_api_key else [],
        },
        "strategies": list(__import__("canopy.sim.engine", fromlist=["STRATEGY_CLASSES"]).STRATEGY_CLASSES),
        "openrouter_enabled": bool(settings.openrouter_api_key),
    }


@router.get("/sim/status")
async def sim_status():
    if _task is None:
        return {"state": "idle"}
    if not _task.done():
        return {"state": "running"}
    if _task.exception() is not None:
        return {"state": "failed", "error": str(_task.exception())}
    return {"state": "finished"}
