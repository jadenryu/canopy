"""Event bus — every market state change lands here, twice:

  1. XADD to the `events` Stream  → append-only history (replayable)
  2. PUBLISH to the `events` channel → live fan-out to the AG-UI bridge

The frontend is a pure projection of this stream. Event types:
job_posted, bid_placed, awarded, executing, scored, settled, failed,
escrow_hold, escrow_release, escrow_refund, reputation_update,
agent_registered, bankruptcy, fork, shock, price_update.
"""
import json
import time

from canopy.redis_client import get_redis

EVENTS_STREAM = "events"
EVENTS_CHANNEL = "events"


async def emit(event_type: str, payload: dict) -> None:
    data = json.dumps({"ts": time.time(), "type": event_type, "payload": payload}, default=str)
    r = get_redis()
    pipe = r.pipeline()
    pipe.xadd(EVENTS_STREAM, {"type": event_type, "data": data})
    pipe.publish(EVENTS_CHANNEL, data)
    await pipe.execute()
