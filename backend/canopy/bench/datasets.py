"""Benchmark dataset loaders — public multi-hop QA suites as market jobs.

Each loader streams from HuggingFace (no full downloads), normalizes to
{question, answer, hops, category}, and caches into a Redis list
(`bench:ds:<id>`) so repeat runs never re-fetch. Bamboogle (125 questions)
is the demo default — small, fast, fully multi-hop.
"""
import json
from itertools import islice

from canopy.redis_client import get_redis

CACHE_N = 300  # rows cached per dataset — plenty for 50-question runs


def _norm(question: str, answer, hops: int = 2, category: str = "multi-hop") -> dict:
    if isinstance(answer, (list, tuple)):
        answer = "; ".join(str(a) for a in answer)
    return {
        "question": str(question).strip(),
        "answer": str(answer).strip(),
        "hops": hops,
        "category": category,
    }


# dataset id (frontend) -> (hf path, hf config, split, row normalizer)
REGISTRY: dict = {
    "bamboogle": (
        "chiayewken/bamboogle",
        None,
        "test",
        lambda r: _norm(r["Question"], r["Answer"]),
    ),
    "hotpotqa": (
        "hotpotqa/hotpot_qa",
        "distractor",
        "validation",
        lambda r: _norm(r["question"], r["answer"]),
    ),
    "2wikimultihopqa": (
        "framolfese/2WikiMultihopQA",
        None,
        "validation",
        lambda r: _norm(r["question"], r["answer"]),
    ),
    "musique": (
        "dgslibisey/MuSiQue",
        None,
        "validation",
        lambda r: _norm(r["question"], r["answer"]),
    ),
    "frames": (
        "google/frames-benchmark",
        None,
        "test",
        lambda r: _norm(r["Prompt"], r["Answer"], hops=3),
    ),
}


async def load_dataset_rows(dataset_id: str, n: int) -> list[dict]:
    """First n normalized rows, served from the Redis cache when warm."""
    if dataset_id not in REGISTRY:
        raise ValueError(f"unknown dataset '{dataset_id}' — one of {sorted(REGISTRY)}")
    r = get_redis()
    key = f"bench:ds:{dataset_id}"
    cached = await r.lrange(key, 0, n - 1)
    if len(cached) >= min(n, CACHE_N):
        return [json.loads(x) for x in cached[:n]]

    from datasets import load_dataset  # heavy import — keep it lazy

    path, config, split, normalize = REGISTRY[dataset_id]
    stream = load_dataset(path, config, split=split, streaming=True)
    rows = [normalize(raw) for raw in islice(stream, CACHE_N)]
    if not rows:
        raise ValueError(f"dataset '{dataset_id}' yielded no rows")
    pipe = r.pipeline()
    pipe.delete(key)
    pipe.rpush(key, *(json.dumps(x) for x in rows))
    await pipe.execute()
    return rows[:n]
