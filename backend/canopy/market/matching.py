"""Capability matching — RedisVL vector search over agent skill embeddings.

The discovery half of the market: a posted job embeds its spec and the
`agents_skills` index returns the top-k nearest agents — only they are
invited to bid. Specialists therefore see their own niches first, which
is what lets specialization emerge. (Best-Use-of-Redis surface: RedisVL
as the matching engine, not a cache.)
"""
import numpy as np
import weave
from redisvl.index import AsyncSearchIndex
from redisvl.query import VectorQuery
from redisvl.schema import IndexSchema

from canopy.agents.skills import embed
from canopy.config import settings
from canopy.redis_client import get_redis

SCHEMA = IndexSchema.from_dict(
    {
        "index": {"name": "agents_skills", "prefix": "skill", "storage_type": "hash"},
        "fields": [
            {"name": "agent_id", "type": "tag"},
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


async def get_index() -> AsyncSearchIndex:
    global _index
    if _index is None:
        _index = AsyncSearchIndex(SCHEMA)
        await _index.set_client(get_redis())
    return _index


async def create_index(overwrite: bool = True) -> None:
    index = await get_index()
    try:
        await index.create(overwrite=overwrite, drop=overwrite)
    except Exception:
        # exists() said yes but the drop hit "Unknown Index name" — the index
        # vanished between check and drop (shared Redis DB). Create fresh.
        await index.create(overwrite=False)


async def index_agent_skills(agent_id: str, skill_text: str) -> None:
    """Embed the agent's skill profile and load it into the RedisVL index."""
    vector = await embed(skill_text)
    index = await get_index()
    await index.load(
        [
            {
                "agent_id": agent_id,
                "embedding": np.array(vector, dtype=np.float32).tobytes(),
            }
        ],
        keys=[f"skill:{agent_id}"],
    )


@weave.op
async def match_agents(job_spec: str, top_k: int | None = None) -> list[str]:
    """Vector-similarity shortlist: which agents should see this job?"""
    vector = await embed(job_spec)
    query = VectorQuery(
        vector=np.array(vector, dtype=np.float32).tobytes(),
        vector_field_name="embedding",
        return_fields=["agent_id"],
        num_results=top_k or settings.match_top_k,
    )
    index = await get_index()
    results = await index.query(query)
    return [r["agent_id"] for r in results]


async def remove_agent_skills(agent_id: str) -> None:
    """Drop a bankrupt agent from the matching index."""
    r = get_redis()
    await r.delete(f"skill:{agent_id}")
