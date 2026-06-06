"""Skill profiles + embeddings — what RedisVL matches jobs against.

Each agent registers a natural-language skill description; its embedding
(text-embedding-3-small, Matryoshka-truncated to 256 dims) lands in the
RedisVL index. Jobs embed their spec text and shortlist the nearest agents.
"""
import weave
from openai import AsyncOpenAI

from canopy.config import settings

_client: AsyncOpenAI | None = None


def _openai() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


# category -> skill blurb for specialist workers
SPECIALIST_PROFILES: dict[str, str] = {
    "film": (
        "Specialist in film, cinema, directors, actors, art and entertainment "
        "trivia — movies, paintings, museums, awards and culture."
    ),
    "geography": (
        "Specialist in geography — countries, capitals, rivers, mountains, "
        "coastlines, continents and world facts."
    ),
    "science": (
        "Specialist in science — chemistry, physics, astronomy, elements, "
        "planets, formulas and discoveries."
    ),
    "history": (
        "Specialist in history and literature — presidents, authors, books, "
        "wars, centuries and historical events."
    ),
}

GENERALIST_PROFILE = (
    "Generalist worker agent. Answers any trivia or research question across "
    "all topics at a fair price."
)

MANAGER_PROFILE = (
    "Project manager agent. Takes on complex multi-part questions, decomposes "
    "them into sub-tasks, hires subcontractor agents, and assembles the answers."
)


@weave.op
async def embed(text: str) -> list[float]:
    resp = await _openai().embeddings.create(
        model=settings.embedding_model,
        input=text,
        dimensions=settings.embedding_dims,
    )
    return resp.data[0].embedding
