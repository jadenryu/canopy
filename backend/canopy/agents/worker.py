"""Worker agent — OpenAI-backed executor on top of the bidding Agent base.

Every step is a @weave.op so a job's trace reads thread -> turns -> steps.
`mock=True` skips the LLM (canned output) for fast market-plumbing tests.
"""
import random

import weave
from openai import AsyncOpenAI

from canopy.agents.base import Agent
from canopy.agents.strategies import Strategy
from canopy.config import settings
from canopy.jobs.schema import Job, JobResult

_client: AsyncOpenAI | None = None


def _openai() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


class Worker(Agent):
    def __init__(
        self,
        agent_id: str,
        strategy: Strategy | None = None,
        model_tier: str = "cheap",
        rng: random.Random | None = None,
        mock: bool = False,
    ):
        super().__init__(agent_id, strategy=strategy, model_tier=model_tier, rng=rng)
        self.model = (
            settings.worker_model_premium
            if model_tier == "premium"
            else settings.worker_model_cheap
        )
        self.mock = mock

    @weave.op
    async def execute_job(self, job: Job) -> JobResult:
        if self.mock:
            output = f"[mock execution by {self.id}]\nFINAL ANSWER: (mock)"
        else:
            output = await self.llm_call(job.spec)
        return JobResult(job_id=job.id, agent_id=self.id, output=output)

    @weave.op
    async def llm_call(self, prompt: str) -> str:
        resp = await _openai().chat.completions.create(
            model=self.model,
            max_completion_tokens=settings.worker_max_tokens,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a worker agent in a labor market. Answer the "
                        "question concisely and end with a line of the form "
                        "'FINAL ANSWER: <answer>'."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        )
        return resp.choices[0].message.content or ""
