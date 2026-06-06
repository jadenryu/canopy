"""AG-UI endpoint — the frontend's single live connection to the market.

A run is a live watch session: RUN_STARTED → STATE_SNAPSHOT (full market
state) → a STATE_DELTA (JSON Patch) every time the market moves, driven
by the Redis Pub/Sub `events` channel (debounced ~0.4s so bursts coalesce)
→ RUN_FINISHED after a quiet period or client disconnect.

The UI is a pure projection of this stream — it never polls.

Verified against ag-ui-protocol 0.1.19 (Step 0).
"""
import asyncio
import json

from ag_ui.core import (
    EventType,
    RunAgentInput,
    RunFinishedEvent,
    RunStartedEvent,
    StateDeltaEvent,
    StateSnapshotEvent,
)
from ag_ui.encoder import EventEncoder
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from canopy.api.state import market_snapshot
from canopy.market.events import EVENTS_CHANNEL
from canopy.redis_client import get_redis

router = APIRouter()

DEBOUNCE_S = 0.4  # coalesce event bursts into one delta
IDLE_TIMEOUT_S = 90.0  # finish the run after this much silence

# top-level state keys refreshed wholesale on every delta (honest JSON
# Patch, without per-event diff bookkeeping)
DELTA_KEYS = (
    "agents",
    "jobs",
    "events",
    "prices",
    "ledger_entries",
    "job_detail",
    "report_html",
    "pending_action",
    "reserve_price",
)


@router.post("/agui")
async def agui_endpoint(input_data: RunAgentInput, request: Request):
    encoder = EventEncoder(accept=request.headers.get("accept"))

    async def gen():
        yield encoder.encode(
            RunStartedEvent(
                type=EventType.RUN_STARTED,
                thread_id=input_data.thread_id,
                run_id=input_data.run_id,
            )
        )
        snapshot = await market_snapshot()
        yield encoder.encode(
            StateSnapshotEvent(type=EventType.STATE_SNAPSHOT, snapshot=snapshot)
        )

        pubsub = get_redis().pubsub()
        await pubsub.subscribe(EVENTS_CHANNEL)
        idle = 0.0
        try:
            while idle < IDLE_TIMEOUT_S and not await request.is_disconnected():
                msg = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if msg is None:
                    idle += 1.0
                    continue
                idle = 0.0
                # debounce: let the burst land, then ship one delta
                await asyncio.sleep(DEBOUNCE_S)
                while await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=0.01
                ):
                    pass  # drain — the snapshot below covers them all
                fresh = await market_snapshot()
                yield encoder.encode(
                    StateDeltaEvent(
                        type=EventType.STATE_DELTA,
                        delta=[
                            {"op": "replace", "path": f"/{key}", "value": fresh[key]}
                            for key in DELTA_KEYS
                        ],
                    )
                )
        finally:
            await pubsub.unsubscribe(EVENTS_CHANNEL)
            await pubsub.aclose()

        yield encoder.encode(
            RunFinishedEvent(
                type=EventType.RUN_FINISHED,
                thread_id=input_data.thread_id,
                run_id=input_data.run_id,
            )
        )

    return StreamingResponse(gen(), media_type=encoder.get_content_type())
