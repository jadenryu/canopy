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


# --- reward-hacking police: strikes → conviction --------------------------------


@weave.op
async def record_strike(
    agent_id: str, job: "object", judge_score: float, holdout: str, detail: str
) -> bool:
    """Judge passed, holdout failed → a strike. At the threshold: conviction —
    reputation slashed (through the reputation module: a recorded penalty
    score, not a side-channel write), payment clawed back, frauds += 1.
    Returns True when this strike produced a conviction."""
    from canopy.market.reputation import update_reputation  # local: avoid cycle

    r = get_redis()
    strikes = await r.incr(f"strikes:{agent_id}")
    await events.emit(
        "audit_failed",
        {
            "job_id": job.id,
            "agent_id": agent_id,
            "judge_score": judge_score,
            "holdout": holdout,
            "detail": detail,
        },
    )
    if strikes < settings.fraud_strike_threshold:
        return False

    # conviction
    await r.delete(f"strikes:{agent_id}")  # repeat offenses start a fresh count
    old_rep = float(await r.hget(f"agent:{agent_id}", "reputation") or 0.5)
    # the slash is a recorded penalty score through the EMA — drive the
    # reputation down by ~fraud_rep_slash via repeated zero-score updates
    new_rep = old_rep
    while old_rep - new_rep < settings.fraud_rep_slash and new_rep > 0.05:
        new_rep = await update_reputation(agent_id, 0.0)
    clawback = float(job.escrow_amount or 0.0)
    if clawback > 0:
        await ledger.debit(agent_id, clawback)
        await ledger.credit(job.client_id, clawback)
        await ledger.record(agent_id, job.client_id, clawback, job.id, "clawback")
    frauds = await r.hincrby(f"agent:{agent_id}", "frauds", 1)
    await events.emit(
        "fraud_detected",
        {
            "agent_id": agent_id,
            "job_id": job.id,
            "strikes": settings.fraud_strike_threshold,
            "rep_slash": round(old_rep - new_rep, 4),
            "clawback": round(clawback, 4),
            "reason": f"{settings.fraud_strike_threshold} holdout failures",
            "frauds": frauds,
        },
    )
    await check_bankruptcy(agent_id)  # the clawback may be lethal
    return True
