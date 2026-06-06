"""Worker agent — Phase 0: minimal OpenAI-backed executor.

Later phases add: bid(), strategies, skill embeddings, subcontracting.
Every step is a @weave.op so a job's trace reads session -> turns -> steps.
"""
import weave
from openai import AsyncOpenAI

from canopy.config import settings
from canopy.jobs.schema import Job, JobResult

_client: AsyncOpenAI | None = None


def _openai() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


class Worker:
    def __init__(self, agent_id: str, model: str | None = None):
        self.id = agent_id
        self.model = model or settings.worker_model_cheap

    @weave.op
    async def execute_job(self, job: Job) -> JobResult:
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
