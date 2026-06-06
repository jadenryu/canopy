"""AG-UI endpoint — the frontend's single live connection to the market.

Phase 0: emits RUN_STARTED -> STATE_SNAPSHOT (a minimal market snapshot)
-> a greeting text message -> RUN_FINISHED. Later phases stream STATE_DELTA
events as the market moves.

Verified against ag-ui-protocol 0.1.19 (Step 0).
"""
import uuid

from ag_ui.core import (
    EventType,
    RunAgentInput,
    RunFinishedEvent,
    RunStartedEvent,
    StateSnapshotEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
)
from ag_ui.encoder import EventEncoder
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from canopy.redis_client import get_redis

router = APIRouter()


async def _market_snapshot() -> dict:
    """Phase 0: a minimal snapshot proving Redis + backend are live."""
    r = get_redis()
    pong = await r.ping()
    return {
        "market": "canopy",
        "redis_connected": bool(pong),
        "agents": [],
        "order_book": [],
        "events": [],
    }


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
        snapshot = await _market_snapshot()
        yield encoder.encode(
            StateSnapshotEvent(type=EventType.STATE_SNAPSHOT, snapshot=snapshot)
        )
        msg_id = str(uuid.uuid4())
        yield encoder.encode(
            TextMessageStartEvent(
                type=EventType.TEXT_MESSAGE_START, message_id=msg_id, role="assistant"
            )
        )
        yield encoder.encode(
            TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT,
                message_id=msg_id,
                delta="Canopy market online. Redis connected: "
                + str(snapshot["redis_connected"]),
            )
        )
        yield encoder.encode(
            TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=msg_id)
        )
        yield encoder.encode(
            RunFinishedEvent(
                type=EventType.RUN_FINISHED,
                thread_id=input_data.thread_id,
                run_id=input_data.run_id,
            )
        )

    return StreamingResponse(gen(), media_type=encoder.get_content_type())
