"""Reverse auction — winner selection straight off the bid-book ZSET.

The market is NOT a planner: the winner is simply ZRANGE[0] of
`job:{id}:bids` (lowest effective_bid = price / rep_weight). Award moves
the bounty into escrow and closes the job in the order book.
"""
import weave

from canopy.jobs.schema import Bid, Job, JobStatus
from canopy.market import escrow, events, order_book


@weave.op
async def run_auction(job_id: str) -> Bid | None:
    """Pick the winning bid (lowest effective bid) from the ZSET."""
    return await order_book.lowest_bid(job_id)


@weave.op
async def award(job: Job, winning_bid: Bid) -> Job:
    """Winner selected → escrow the bid price, close the order-book entry."""
    job.status = JobStatus.AWARDED
    job.winner_id = winning_bid.agent_id
    job.escrow_amount = winning_bid.price
    await order_book.save_job(job)
    await order_book.remove_open(job.id)
    await escrow.hold(job.id, job.client_id, winning_bid.price)
    await events.emit(
        "awarded",
        {
            "job_id": job.id,
            "winner_id": winning_bid.agent_id,
            "price": round(winning_bid.price, 4),
            "effective_bid": round(winning_bid.effective_bid, 4),
        },
    )
    return job
