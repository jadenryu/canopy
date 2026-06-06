"""Phase 0 smoke test — one hardcoded job end-to-end.

Run: cd backend && uv run python -m canopy.sim.phase0

✅ Done when: this prints an answer, the job's trace (thread -> turns ->
steps incl. the OpenAI call) is visible in the Weave UI, and Redis pings.
"""
import asyncio

import weave

from canopy.agents.worker import Worker
from canopy.jobs.schema import Job
from canopy.redis_client import get_redis
from canopy.weave_setup import init_weave


async def main():
    init_weave()

    r = get_redis()
    assert await r.ping(), "Redis unreachable — check REDIS_URL in .env"
    print("✓ Redis connected")

    job = Job(
        id="job-phase0-001",
        spec=(
            "Multi-hop question: Which year was the director of the film "
            "'Inception' born, and what other film did he direct in 2014?"
        ),
        category="multi-hop-qa",
        ground_truth="1970; Interstellar",
    )

    worker = Worker(agent_id="worker-001")

    # agent-native tracing: the job is a Weave thread; calls inside are turns
    with weave.thread(job.id) as t:
        print(f"✓ Weave thread: {t.thread_id}")
        result = await worker.execute_job(job)

    print("\n--- worker output ---")
    print(result.output)
    print("---------------------")
    print("✓ Phase 0 complete. Check the trace in your Weave project UI.")


if __name__ == "__main__":
    asyncio.run(main())
