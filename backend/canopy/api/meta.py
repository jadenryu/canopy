"""Meta endpoints — the integrations and evaluation surfaces, opened up.

/meta/integrations: LIVE statistics from each sponsor integration — Redis
key/stream counts, the Weave project artifacts, the AG-UI connection
contract. These are core infrastructure, and the UI signposts them as such.

/eval/results: the formal allocator evaluation (canopy-allocator-eval),
served raw + aggregated so models/allocators are comparable in the UI.
"""
import json
import statistics
from collections import defaultdict
from pathlib import Path

from fastapi import APIRouter

from canopy.config import settings
from canopy.redis_client import get_redis

router = APIRouter()

CHECKPOINT = Path(__file__).resolve().parents[3] / "documentation" / "eval_checkpoint.json"


async def _count(r, pattern: str) -> int:
    n = 0
    async for _ in r.scan_iter(match=pattern, count=500):
        n += 1
    return n


@router.get("/meta/integrations")
async def integrations():
    r = get_redis()
    weave_base = f"https://wandb.ai/{settings.weave_entity}/{settings.weave_project}"
    return {
        "redis": {
            "role": "The exchange itself — order book, bid books, ledger, event bus, matching index. Zero caching.",
            "connected": bool(await r.ping()),
            "stats": {
                "events_stream": await r.xlen("events"),
                "ledger_stream": await r.xlen("ledger"),
                "active_agents": await r.scard("agents:active"),
                "job_documents": await _count(r, "job:*"),
                "skill_vectors": await _count(r, "skill:*"),
                "price_series": await _count(r, "prices:*"),
                "lesson_lists": await _count(r, "lessons:*"),
            },
            "primitives": {
                "jobs:open / job:{id}:bids": "Sorted Sets — the order book; lowest effective bid wins",
                "ledger / events": "Streams — append-only book of record + market event bus",
                "events channel": "Pub/Sub — fans every state change to the AG-UI stream",
                "skill:{agent}": "RedisVL vector index — capability matching routes jobs to agents",
                "lessons:{agent}": "Capped lists — each agent's distilled Weave feedback",
            },
        },
        "weave": {
            "role": "The referee and credit bureau — scores set payment and reputation; evaluations prove the mechanism.",
            "project_url": f"{weave_base}/weave",
            "surfaces": {
                "Per-job agent tracing": f"{weave_base}/weave/traces",
                "Referee + guardrail scorers": f"{weave_base}/weave/scorers",
                "Reputation leaderboard": f"{weave_base}/weave/leaderboards",
                "Allocator evaluation": f"{weave_base}/weave/evaluations",
                "Live guardrail monitor": f"{weave_base}/weave/monitors",
            },
        },
        "copilotkit": {
            "role": "The AG-UI runtime — this dashboard is a pure projection of one shared-state stream.",
            "endpoint": "/agui",
            "wire": "RUN_STARTED → STATE_SNAPSHOT → STATE_DELTA (JSON Patch per market event)",
            "patterns": {
                "controlled": "fixed widgets fed by shared state (flow board, tables, charts)",
                "declarative": "backend streams a UI spec; a generic renderer walks it (bid comparison)",
                "open-ended": "agent-authored HTML rendered in a sandboxed iframe (analyst report)",
            },
            "hitl": "high-impact actions suspend into shared state until approved",
        },
    }


@router.get("/eval/results")
async def eval_results():
    r = get_redis()
    judge_audit_raw = await r.get("eval:judge_audit")
    runs: dict = {}
    if CHECKPOINT.exists():
        runs = json.loads(CHECKPOINT.read_text())
    by_condition: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for key, m in runs.items():
        cond = key.split("/")[0]
        for metric, value in m.items():
            by_condition[cond][metric].append(value)
    table = []
    for cond, metrics in by_condition.items():
        quality = statistics.mean(metrics["quality"])
        paid = statistics.mean(metrics["paid"])
        table.append(
            {
                "condition": cond,
                "quality": round(quality, 3),
                "accuracy": round(statistics.mean(metrics["accuracy"]), 3),
                "paid_per_job": round(paid, 3),
                "quality_per_dollar": round(quality / paid, 3) if paid else 0.0,
                "seeds": len(metrics["quality"]),
            }
        )
    table.sort(key=lambda x: -x["quality_per_dollar"])
    weave_base = f"https://wandb.ai/{settings.weave_entity}/{settings.weave_project}"
    return {
        "judge_audit": json.loads(judge_audit_raw) if judge_audit_raw else None,
        "evaluation": "canopy-allocator-eval",
        "description": "25 held-out jobs (incl. unseen category), 3 seeds, identical fleet/scorer/lifecycle — only the assignment rule differs. Two saboteur agents in every fleet.",
        "table": table,
        "runs": runs,
        "weave_url": f"{weave_base}/weave/evaluations",
    }
