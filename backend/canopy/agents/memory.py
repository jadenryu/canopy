"""Semantic agent memory — retrieval-by-relevance over an agent's own lessons.

The lessons loop injects an agent's last 5 lessons; this upgrades that to
relevance: each lesson is embedded and stored in a per-agent RedisVL index,
and at execution time the agent retrieves the lessons most similar to the
CURRENT job — so a geography lesson surfaces on a geography job, not
whatever happened to be recent.

Hand-rolled on the existing RedisVL stack (no separate memory server).
OFF by default (settings.semantic_memory) so the scripted demo stays
deterministic; flip the flag to enable + run the ablation.
"""
import numpy as np
import weave
from redisvl.index import AsyncSearchIndex
from redisvl.query import VectorQuery
from redisvl.query.filter import Tag
from redisvl.schema import IndexSchema

from canopy.agents.skills import embed
from canopy.config import settings
from canopy.redis_client import get_redis

SCHEMA = IndexSchema.from_dict(
    {
        "index": {"name": "agent_memory", "prefix": "memory", "storage_type": "hash"},
        "fields": [
            {"name": "agent_id", "type": "tag"},
            {"name": "lesson", "type": "text"},
            {"name": "score", "type": "numeric"},
            {
                "name": "embedding",
                "type": "vector",
                "attrs": {
                    "dims": settings.embedding_dims,
                    "distance_metric": "cosine",
                    "algorithm": "flat",
                    "datatype": "float32",
                },
            },
        ],
    }
)

_index: AsyncSearchIndex | None = None


async def _get_index() -> AsyncSearchIndex:
    global _index
    if _index is None:
        _index = AsyncSearchIndex(SCHEMA)
        await _index.set_client(get_redis())
        try:
            await _index.create(overwrite=False)
        except Exception:
            pass  # already exists
    return _index


@weave.op
async def remember(agent_id: str, job_id: str, job_spec: str, lesson: str, score: float) -> None:
    """Embed the lesson (keyed on the job that taught it) into the agent's memory."""
    if not settings.semantic_memory:
        return
    vector = await embed(job_spec)
    index = await _get_index()
    await index.load(
        [
            {
                "agent_id": agent_id,
                "lesson": lesson,
                "score": float(score),
                "embedding": np.array(vector, dtype=np.float32).tobytes(),
            }
        ],
        keys=[f"memory:{agent_id}:{job_id}"],
    )


@weave.op
async def recall(agent_id: str, job_spec: str, k: int = 3) -> list[str]:
    """The agent's own lessons most relevant to this job spec."""
    if not settings.semantic_memory:
        return []
    vector = await embed(job_spec)
    query = VectorQuery(
        vector=np.array(vector, dtype=np.float32).tobytes(),
        vector_field_name="embedding",
        return_fields=["lesson", "score"],
        filter_expression=Tag("agent_id") == agent_id,
        num_results=k,
    )
    index = await _get_index()
    results = await index.query(query)
    return [r["lesson"] for r in results if r.get("lesson")]


def memory_block(lessons: list[str]) -> str:
    if not lessons:
        return ""
    body = "\n".join(f"- {l}" for l in lessons)
    return f"\nRelevant lessons from your past work on similar questions:\n{body}\n"
