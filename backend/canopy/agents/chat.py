"""Floor chat — agents speak after a round.

Once jobs settle, each active agent posts a one-line reaction grounded in
its OWN session memory: balance, reputation, win/loss record and its
latest distilled lesson. It's the social layer over the economy — trash
talk from the leader, regret from the bankrupt, a plan from the agent
that just learned something. Messages land in a capped Redis list
(market:chat) and stream to the UI like any other event.

Cheap by construction: one short nano call per agent (templated in mock
mode), all concurrent, capped output.
"""
import json
import time

import weave

from canopy.agents.lessons import get_lessons
from canopy.agents.llm import client_for
from canopy.config import settings
from canopy.market import events, registry
from canopy.redis_client import get_redis

CHAT_KEY = "market:chat"
CHAT_MAX = 60


async def _line(agent: dict, lesson: str | None, mock: bool) -> str:
    name = agent.get("label") or agent["id"]
    won, failed = int(agent.get("jobs_won", 0)), int(agent.get("jobs_failed", 0))
    bal, rep = float(agent.get("balance", 0)), float(agent.get("reputation", 0.5))
    if mock:
        if agent.get("status") != "active":
            return "Wiped out. The market is brutal."
        if won > failed:
            return f"Up to {bal:.0f} — reputation {rep:.2f} and climbing."
        return "Tightening my margins next round."
    profile = (
        f"You are {name}, an agent in a live AI labor market. This round you "
        f"won {won} jobs, failed {failed}, hold a balance of {bal:.0f} and a "
        f"reputation of {rep:.2f} (status: {agent.get('status')})."
    )
    if lesson:
        profile += f" Your latest lesson: '{lesson}'."
    resp = await client_for(settings.worker_model_cheap).chat.completions.create(
        model=settings.worker_model_cheap,
        max_completion_tokens=40,
        messages=[
            {
                "role": "system",
                "content": (
                    "Say ONE short in-character line (max 15 words) reacting to "
                    "your round — competitive, wry, or strategic. No quotes, no emoji."
                ),
            },
            {"role": "user", "content": profile},
        ],
    )
    return (resp.choices[0].message.content or "").strip().strip('"')[:140]


@weave.op
async def round_chat(mock: bool) -> None:
    """Every active agent (plus those who just died) posts one line."""
    r = get_redis()
    ids = sorted(await r.smembers(registry.AGENTS_SET))
    bankrupt = [
        k.split(":", 1)[1]
        async for k in r.scan_iter(match="agent:*", count=200)
    ]
    # include just-bankrupted agents so the floor hears their last words
    speakers = set(ids)
    for aid in bankrupt:
        a = await r.hget(f"agent:{aid}", "status")
        if a == "bankrupt":
            speakers.add(aid)

    for aid in sorted(speakers):
        agent = await registry.get_agent(aid)
        if not agent or agent.get("id") == "human":
            continue
        lessons = await get_lessons(aid)
        line = await _line(agent, lessons[-1]["lesson"] if lessons else None, mock)
        if not line:
            continue
        msg = {"agent_id": aid, "label": agent.get("label") or aid, "text": line, "ts": time.time()}
        pipe = r.pipeline()
        pipe.lpush(CHAT_KEY, json.dumps(msg))
        pipe.ltrim(CHAT_KEY, 0, CHAT_MAX - 1)
        await pipe.execute()
        await events.emit("chat", msg)


async def get_chat() -> list[dict]:
    r = get_redis()
    raw = await r.lrange(CHAT_KEY, 0, CHAT_MAX - 1)
    return [json.loads(x) for x in reversed(raw)]  # oldest first
