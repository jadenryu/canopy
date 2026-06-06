"""Wallets + the append-only ledger.

Balances live in the `agent:{id}` Hash (HINCRBYFLOAT = atomic transfer leg).
Every movement of money is recorded in the `ledger` Stream — the market's
book of record. Redis primitives only; nothing here is a cache.
"""
import time

from canopy.redis_client import get_redis

LEDGER_STREAM = "ledger"


async def record(from_id: str, to_id: str, amount: float, job_id: str, tx_type: str) -> None:
    """Append one transaction to the ledger Stream."""
    r = get_redis()
    await r.xadd(
        LEDGER_STREAM,
        {
            "ts": str(time.time()),
            "from": from_id,
            "to": to_id,
            "amount": f"{amount:.4f}",
            "job_id": job_id,
            "type": tx_type,
        },
    )


async def credit(agent_id: str, amount: float) -> float:
    r = get_redis()
    return float(await r.hincrbyfloat(f"agent:{agent_id}", "balance", amount))


async def debit(agent_id: str, amount: float) -> float:
    r = get_redis()
    return float(await r.hincrbyfloat(f"agent:{agent_id}", "balance", -amount))


async def balance(agent_id: str) -> float:
    r = get_redis()
    raw = await r.hget(f"agent:{agent_id}", "balance")
    return float(raw) if raw is not None else 0.0
