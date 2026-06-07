"""Benchmark runner — models compete for benchmark questions in the market.

Static benchmarks ask "can the model answer?"; Canopy's asks "can it price
its own work and stay solvent?". Each run fields one custom agent per
chosen model, drives sampled benchmark questions through the chosen
allocator with the FULL market lifecycle (escrow, guardrail, referee,
penalties, bankruptcy), aggregates per-model economics, and logs one
weave EvaluationLogger run per model — the same referee that settles live
trades is the benchmark judge.

Allocator semantics for a bench run:
  market           full reverse auction — fielded models compete with the
                   house fleet and each other (market_share is real)
  random           each question assigned to a random fielded model
  round_robin      fielded models take turns
  single_cheap /   isolated classic mode — EVERY model answers EVERY
  single_premium   question independently (no competition, no share)
"""
import asyncio
import datetime as dt
import json
import random
import re

import weave

from canopy.agents.strategies import Undercutter
from canopy.agents.worker import Worker
from canopy.bench.datasets import load_dataset_rows
from canopy.config import settings
from canopy.eval.allocators import quote
from canopy.jobs.schema import Bid, Job, JobStatus
from canopy.market import events, matching, registry
from canopy.redis_client import get_redis
from canopy.scoring.leaderboard import SCORER_NAME
from canopy.sim.engine import Market, ensure_market

RUNS_KEY = "bench:runs"
LOCK_KEY = "bench:lock"
MAX_QUESTIONS = 50

ISOLATED = {"single_cheap", "single_premium"}


def _slug(model: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", model.lower()).strip("-")


async def run_benchmark(
    dataset: str, models: list[str], allocator: str, questions: int, mock: bool
) -> list[dict]:
    r = get_redis()
    questions = max(1, min(questions, MAX_QUESTIONS))
    seq = await r.incr("bench:run_counter")
    run_id = f"br-{seq:03d}"

    rows = await load_dataset_rows(dataset, questions * 3)
    rng = random.Random(settings.rng_seed + seq)
    sample = rng.sample(rows, min(questions, len(rows)))

    base = await ensure_market()
    # field one challenger agent per model — sharp pricing so they actually
    # win auctions against the house fleet (that's the contest)
    fielded: dict[str, Worker] = {}
    for model in models:
        agent_id = f"you-bench-{_slug(model)}-{seq}"
        w = Worker(agent_id, strategy=Undercutter(random.Random(rng.random())), model=model, mock=mock)
        w.skill_text = f"Benchmark challenger running {model}. Answers any question."
        fielded[model] = w
        await registry.register_agent(
            agent_id, agent_id, w.display_tier, "undercutter", label=f"{model} (benchmark)"
        )
        await matching.index_agent_skills(agent_id, w.skill_text)

    # bench market = house fleet + challengers; in mock runs the WHOLE fleet
    # mocks (a "plumbing" run must never spend real tokens)
    house_mock_flags = {w.id: w.mock for w in base.workers.values()}
    if mock:
        for w in base.workers.values():
            w.mock = True
    market = Market(list(base.workers.values()) + list(fielded.values()), mock, rng)
    await events.emit(
        "bench_run_started",
        {"run_id": run_id, "dataset": dataset, "models": models, "allocator": allocator,
         "questions": len(sample)},
    )

    try:
        jobs = [
            Job(
                id=f"bench-{seq}-{i:03d}",
                spec=row["question"],
                category=row["category"],
                hops=row["hops"],
                bounty_cap=settings.default_bounty_cap,
                client_id="human",
                ground_truth=row["answer"],
            )
            for i, row in enumerate(sample)
        ]

        # per-model tallies + per-model weave eval rows
        tally: dict[str, dict] = {m: {"answered": 0, "correct": 0, "paid": 0.0, "preds": []} for m in models}

        async def run_assigned(job: Job, worker: Worker):
            with weave.thread(job.id):
                from canopy.market import order_book

                await order_book.post_job(job)
                price = await quote(worker, job)
                bid = Bid(job_id=job.id, agent_id=worker.id, price=price, effective_bid=price)
                return await market.finish_job(job, bid)

        fielded_list = list(fielded.items())
        if allocator in ISOLATED:
            for model, worker in fielded_list:
                for i, job in enumerate(jobs):
                    clone = job.model_copy(update={"id": f"{job.id}-{_slug(model)[:16]}"})
                    done, result = await run_assigned(clone, worker)
                    _tally(tally[model], done, result)
        else:
            for i, job in enumerate(jobs):
                if allocator == "market":
                    done, result = await market.run_job(job)
                    winner_model = next(
                        (m for m, w in fielded.items() if w.id == done.winner_id), None
                    )
                    if winner_model:
                        _tally(tally[winner_model], done, result)
                else:
                    if allocator == "random":
                        model, worker = rng.choice(fielded_list)
                    else:  # round_robin
                        model, worker = fielded_list[i % len(fielded_list)]
                    done, result = await run_assigned(job, worker)
                    _tally(tally[model], done, result)

        # weave Evaluation per model (B3): the bench run as a formal eval artifact
        results = []
        finished_at = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
        for model in models:
            t = tally[model]
            if t["preds"] and not mock:
                _log_weave_eval(dataset, model, t["preds"])
            agent = await registry.get_agent(fielded[model].id)
            result_row = {
                "run_id": run_id,
                "dataset": dataset,
                "model": model,
                "allocator": allocator,
                "questions": len(sample),
                "accuracy": round(t["correct"] / t["answered"], 4) if t["answered"] else 0.0,
                "cost_per_correct": round(t["paid"] / t["correct"], 4) if t["correct"] else 0.0,
                "market_share": round(t["answered"] / len(sample), 4) if allocator == "market" else 0.0,
                "bankruptcies": 1 if agent.get("status") == "bankrupt" else 0,
                "finished_at": finished_at,
            }
            results.append(result_row)
            await r.lpush(RUNS_KEY, json.dumps(result_row))

    finally:
        # cleanup MUST run even when a job raises — otherwise the live
        # market keeps mock flags, dead market handles and ghost agents
        # retire the challengers — bench agents don't linger on the floor
        for model, w in fielded.items():
            await r.hset(f"agent:{w.id}", "status", "retired")
            await r.srem(registry.AGENTS_SET, w.id)
            await matching.remove_agent_skills(w.id)
            market.workers.pop(w.id, None)
        for w in base.workers.values():
            w.market = base  # restore house workers to the live session
            w.mock = house_mock_flags.get(w.id, False)

    await events.emit("bench_run_finished", {"run_id": run_id, "results": len(results)})
    return results


def _tally(t: dict, job: Job, result) -> None:
    t["answered"] += 1
    score = (result.score if result else None) or 0.0
    if score >= settings.score_threshold:
        t["correct"] += 1
    if job.status == JobStatus.SETTLED:
        t["paid"] += job.escrow_amount
    t["preds"].append({"question": job.spec, "output": result.output if result else "", "score": score})


def _log_weave_eval(dataset: str, model: str, preds: list[dict]) -> None:
    from weave import EvaluationLogger

    ev = EvaluationLogger(
        name=f"bench-{dataset}",
        model=_slug(model).replace("-", "_"),
        dataset=[{"question": p["question"]} for p in preds],
    )
    for p in preds:
        pred = ev.log_prediction(inputs={"question": p["question"]}, output=p["output"])
        pred.log_score(SCORER_NAME, p["score"])
        pred.finish()
    ev.log_summary()


async def acquire_lock() -> bool:
    r = get_redis()
    return bool(await r.set(LOCK_KEY, "1", nx=True, ex=900))


async def release_lock() -> None:
    await get_redis().delete(LOCK_KEY)
