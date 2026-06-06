"""Agent lifecycle — failure-driven bankruptcy and success-driven forking.

Spec's "Weave Signals → bankruptcy" wiring, adapted (Signals doesn't exist
in weave 0.52.42): every Scorer failure — guardrail rejection or referee
fail — levies a balance penalty on top of lost revenue. Repeated failures
drain the wallet below BANKRUPTCY_FLOOR → the agent is deactivated and
drops out of matching. Scorer verdicts are still the root cause: Weave
scores drive who lives and who dies.

Fork: a balance above FORK_BALANCE spawns a child agent (same strategy)
funded with STARTING_BALANCE from the parent — winners capture demand.
"""
import weave

from canopy.config import settings
from canopy.market import events, ledger, matching
from canopy.market.registry import AGENTS_SET
from canopy.redis_client import get_redis


async def penalize_failure(agent_id: str, job_id: str, reason: str) -> float:
    """Slash the failing agent's balance; returns the new balance."""
    new_balance = await ledger.debit(agent_id, settings.failure_penalty)
    await ledger.record(agent_id, "market", settings.failure_penalty, job_id, "penalty")
    await events.emit(
        "penalty",
        {"agent_id": agent_id, "job_id": job_id, "amount": settings.failure_penalty, "reason": reason},
    )
    return new_balance


@weave.op
async def check_bankruptcy(agent_id: str) -> bool:
    """Below the floor → deactivated, out of the leaderboard race and the
    matching index. The market's natural selection."""
    balance = await ledger.balance(agent_id)
    if balance >= settings.bankruptcy_floor:
        return False
    r = get_redis()
    pipe = r.pipeline()
    pipe.hset(f"agent:{agent_id}", "status", "bankrupt")
    pipe.srem(AGENTS_SET, agent_id)
    await pipe.execute()
    await matching.remove_agent_skills(agent_id)
    await events.emit("bankruptcy", {"agent_id": agent_id, "balance": round(balance, 4)})
    return True


@weave.op
async def check_fork(agent_id: str) -> bool:
    """Above the fork threshold → the parent funds a child copy (capital
    follows success). The sim instantiates and registers the child."""
    balance = await ledger.balance(agent_id)
    return balance > settings.fork_balance


async def fund_fork(parent_id: str, child_id: str) -> None:
    await ledger.debit(parent_id, settings.starting_balance)
    await ledger.record(parent_id, child_id, settings.starting_balance, "", "fork_funding")
    await events.emit("fork", {"parent_id": parent_id, "child_id": child_id})
