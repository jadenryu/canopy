"""Escrow — the market holds the bounty between award and settlement.

Funds sit in the `escrow` Hash (job_id → amount); both legs of every move
hit the ledger Stream. The market never decides who wins — it only holds
the money the mechanism told it to hold.
"""
from canopy.market import events, ledger
from canopy.redis_client import get_redis

ESCROW_KEY = "escrow"


async def hold(job_id: str, client_id: str, amount: float) -> None:
    """Debit the client, park the funds under the job."""
    r = get_redis()
    await ledger.debit(client_id, amount)
    await r.hset(ESCROW_KEY, job_id, f"{amount:.4f}")
    await ledger.record(client_id, "escrow", amount, job_id, "escrow_hold")
    await events.emit("escrow_hold", {"job_id": job_id, "client_id": client_id, "amount": amount})


async def release(job_id: str, to_agent_id: str) -> float:
    """Pay the held amount out to the worker (settlement)."""
    amount = await _take(job_id)
    await ledger.credit(to_agent_id, amount)
    await ledger.record("escrow", to_agent_id, amount, job_id, "escrow_release")
    await events.emit("escrow_release", {"job_id": job_id, "to": to_agent_id, "amount": amount})
    return amount


async def refund(job_id: str, client_id: str) -> float:
    """Return the held amount to the client (failed/rejected job)."""
    amount = await _take(job_id)
    await ledger.credit(client_id, amount)
    await ledger.record("escrow", client_id, amount, job_id, "escrow_refund")
    await events.emit("escrow_refund", {"job_id": job_id, "to": client_id, "amount": amount})
    return amount


async def _take(job_id: str) -> float:
    r = get_redis()
    raw = await r.hget(ESCROW_KEY, job_id)
    if raw is None:
        raise ValueError(f"no escrow held for job {job_id}")
    await r.hdel(ESCROW_KEY, job_id)
    return float(raw)
