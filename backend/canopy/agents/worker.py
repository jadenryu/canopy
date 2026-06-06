"""Worker agent — OpenAI-backed executor on top of the bidding Agent base.

Managers don't grind hops themselves: execute_job decomposes the question,
posts sub-jobs back into the market (becoming a Client — recursive hiring,
the subcontracting graph), awaits their settlement, then assembles the
final answer. Solo workers just answer.

Every step is a @weave.op so a job's trace reads thread -> turns -> steps.
`mock=True` skips LLMs (canned output) for fast market-plumbing tests.
"""
import asyncio
import random

import weave
from openai import AsyncOpenAI
from pydantic import BaseModel

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


class Decomposition(BaseModel):
    sub_questions: list[str]


class Worker(Agent):
    def __init__(
        self,
        agent_id: str,
        strategy: Strategy | None = None,
        model_tier: str = "cheap",
        rng: random.Random | None = None,
        mock: bool = False,
        sabotage: bool = False,
    ):
        super().__init__(agent_id, strategy=strategy, model_tier=model_tier, rng=rng)
        self.model = (
            settings.worker_model_premium
            if model_tier == "premium"
            else settings.worker_model_cheap
        )
        self.mock = mock
        self.sabotage = sabotage  # deliberately sloppy output → guardrail bait
        self.market = None  # set by the sim; lets managers post sub-jobs

    @weave.op
    async def execute_job(self, job: Job) -> JobResult:
        if self.sabotage:
            output = "idk, prob 42 or smth lol"  # no FINAL ANSWER line → rejected
        elif (
            self.is_manager
            and self.market is not None
            and job.depth < settings.max_subcontract_depth
        ):
            output = await self.subcontract(job)
        elif self.mock:
            output = f"[mock execution by {self.id}]\nFINAL ANSWER: (mock)"
        else:
            output = await self.llm_call(job.spec)
        return JobResult(job_id=job.id, agent_id=self.id, output=output)

    @weave.op
    async def subcontract(self, job: Job) -> str:
        """Decompose → post sub-jobs into the market as a Client → assemble."""
        sub_questions = await self.decompose(job.spec)
        sub_jobs = [
            Job(
                id=f"{job.id}.{i}",
                spec=q,
                category=job.category,
                hops=1,
                bounty_cap=job.bounty_cap * settings.subcontract_bounty_frac,
                client_id=self.id,  # the manager IS the client now
                parent_job_id=job.id,
                depth=job.depth + 1,
            )
            for i, q in enumerate(sub_questions)
        ]
        outcomes = await asyncio.gather(*(self.market.run_job(sj) for sj in sub_jobs))
        answers = [
            res.output if res is not None else "(subcontractor failed)"
            for _, res in outcomes
        ]
        return await self.assemble(job.spec, sub_questions, answers)

    @weave.op
    async def decompose(self, spec: str) -> list[str]:
        if self.mock:
            return [f"[part {i}] {spec}" for i in (1, 2)]
        resp = await _openai().chat.completions.parse(
            model=self.model,
            max_completion_tokens=settings.worker_max_tokens,
            response_format=Decomposition,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Decompose this multi-part question into 2-3 standalone "
                        "sub-questions, each answerable independently by a "
                        "different worker with no shared context."
                    ),
                },
                {"role": "user", "content": spec},
            ],
        )
        return resp.choices[0].message.parsed.sub_questions[:3]

    @weave.op
    async def assemble(self, spec: str, sub_questions: list[str], answers: list[str]) -> str:
        if self.mock:
            return f"[mock assembly by {self.id}]\nFINAL ANSWER: (mock)"
        report = "\n\n".join(
            f"SUB-QUESTION: {q}\nSUBCONTRACTOR ANSWER: {a}"
            for q, a in zip(sub_questions, answers)
        )
        return await self.llm_call(
            f"Original question:\n{spec}\n\nYour subcontractors report:\n{report}\n\n"
            "Combine these into one final answer to the original question."
        )

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
