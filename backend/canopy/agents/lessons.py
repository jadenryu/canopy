"""Self-improvement loop — agents learn from their own Weave feedback.

After the referee scores a job, the agent distills the score + rationale
into a one-line lesson (one capped nano call; templated in mock mode),
stores it in a capped Redis list (another non-cache Redis use), and
carries it forward through two channels:

  1. prompts — lessons are injected into future answer prompts
  2. bid calibration — recent mean score nudges the asking price down
     after a rough patch (deterministic, visibly fewer rejections)
"""
import json
import time

import weave

from canopy.agents.llm import client_for
from canopy.config import settings
from canopy.market import events
from canopy.redis_client import get_redis


def _key(agent_id: str) -> str:
    return f"lessons:{agent_id}"


@weave.op
async def extract_lesson(job_spec: str, score: float, rationale: str, mock: bool) -> str:
    """Score + rationale → one line the agent can act on next time."""
    if mock:
        return f"docked: {rationale[:60]}"
    resp = await client_for(settings.worker_model_cheap).chat.completions.create(
        model=settings.worker_model_cheap,
        max_completion_tokens=settings.lesson_max_tokens,
        messages=[
            {
                "role": "system",
                "content": (
                    "You turn a grader's feedback into ONE actionable lesson "
                    "for the worker, max 12 words, imperative voice. Output "
                    "only the lesson."
                ),
            },
            {
                "role": "user",
                "content": f"Task: {job_spec}\nScore: {score}\nGrader said: {rationale}",
            },
        ],
    )
    lesson = (resp.choices[0].message.content or "").strip().strip('"')
    return lesson[:80] or f"score {score:.2f}: review the grader rationale"


async def store_lesson(agent_id: str, job_id: str, score: float, lesson: str) -> None:
    """LPUSH + LTRIM to lessons_max; emit the feed event."""
    r = get_redis()
    entry = {"job_id": job_id, "score": round(score, 3), "lesson": lesson[:80], "ts": time.time()}
    pipe = r.pipeline()
    pipe.lpush(_key(agent_id), json.dumps(entry))
    pipe.ltrim(_key(agent_id), 0, settings.lessons_max - 1)
    await pipe.execute()
    await events.emit(
        "lesson_learned",
        {"agent_id": agent_id, "job_id": job_id, "score": round(score, 3), "lesson": lesson[:80]},
    )


async def get_lessons(agent_id: str) -> list[dict]:
    """Newest LAST (the AgentRow contract — the frontend reverses)."""
    r = get_redis()
    raw = await r.lrange(_key(agent_id), 0, settings.lessons_max - 1)
    return [json.loads(x) for x in reversed(raw)]


async def recent_mean_score(agent_id: str) -> float | None:
    lessons = await get_lessons(agent_id)
    if not lessons:
        return None
    return sum(l["score"] for l in lessons) / len(lessons)


def prompt_block(lessons: list[dict]) -> str:
    if not lessons:
        return ""
    lines = "\n".join(f"- {l['lesson']}" for l in lessons[-3:])
    return f"\nLessons from your past graded work:\n{lines}\n"
