"""Benchmark endpoints — /bench/run queues a run, /bench/runs lists results.

The frontend /benchmarks page posts the run spec and polls the results
list; live progress shows on the trading floor via the regular event bus
(bench jobs are market jobs).
"""
import asyncio
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from canopy.bench.datasets import REGISTRY
from canopy.bench.runner import RUNS_KEY, acquire_lock, release_lock, run_benchmark
from canopy.config import settings
from canopy.eval.allocators import CONDITIONS
from canopy.redis_client import get_redis

router = APIRouter(prefix="/bench")


class BenchRunRequest(BaseModel):
    dataset: str = "bamboogle"
    models: list[str]
    allocator: str = "market"
    questions: int = 10
    mock: bool = False  # not sent by the UI; for plumbing tests


@router.post("/run")
async def bench_run(body: BenchRunRequest):
    if body.dataset not in REGISTRY:
        raise HTTPException(status_code=400, detail=f"unknown dataset — one of {sorted(REGISTRY)}")
    if body.allocator not in CONDITIONS:
        raise HTTPException(status_code=400, detail=f"unknown allocator — one of {CONDITIONS}")
    if not body.models:
        raise HTTPException(status_code=400, detail="pick at least one model")
    if any("/" not in m for m in body.models):
        raise HTTPException(status_code=400, detail="models must be OpenRouter ids (org/model)")
    if not settings.openrouter_api_key and not body.mock:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured")
    if not await acquire_lock():
        raise HTTPException(status_code=409, detail="a benchmark run is already in progress")

    async def go():
        try:
            await run_benchmark(
                body.dataset, body.models, body.allocator, body.questions, body.mock
            )
        finally:
            await release_lock()

    asyncio.create_task(go())
    return {
        "status": "started",
        "dataset": body.dataset,
        "models": body.models,
        "questions": min(body.questions, 50),
    }


@router.get("/runs")
async def bench_runs():
    r = get_redis()
    raw = await r.lrange(RUNS_KEY, 0, 49)
    return [json.loads(x) for x in raw]
