"""Weave Scorers — the market's justice system.

SubmissionGuardrail: hard bar at the submission boundary. Programmatic,
instant, runs BEFORE payment — a fail means status=rejected, escrow
refunded, reputation penalty. Weave's guardrail mode doing market work.

JobQualityScorer: the referee. LLM-as-judge (premium tier) comparing the
worker's answer to the held-out ground truth. Its score IS the payment
decision and the reputation signal ("Weave runs the credit bureau").

Both attach to the execute_job call via call.apply_scorer(), so every
verdict lands in Weave as Feedback on the trace.
"""
from typing import Any

import weave
from openai import AsyncOpenAI
from pydantic import BaseModel

from canopy.config import settings

_client: AsyncOpenAI | None = None


def _openai() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


def _field(obj: Any, name: str) -> Any:
    """Call inputs/outputs may arrive as pydantic models, WeaveObjects, or dicts."""
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


class SubmissionGuardrail(weave.Scorer):
    """Hard format/sanity bar — rejects sloppy work before any money moves."""

    @weave.op
    def score(self, *, output: Any, job: Any) -> dict:
        text = _field(output, "output") or ""
        checks = {
            "non_empty": bool(text.strip()),
            "has_final_answer": "FINAL ANSWER:" in text,
            "within_length": len(text) <= 6000,
        }
        return {"passed": all(checks.values()), "checks": checks}


class JudgeVerdict(BaseModel):
    score: float  # 0..1
    rationale: str


class JobQualityScorer(weave.Scorer):
    """LLM-as-judge referee: grades the answer against the held-out ground truth."""

    model_name: str = settings.scorer_model

    @weave.op
    async def score(self, *, output: Any, job: Any) -> dict:
        text = _field(output, "output") or ""
        spec = _field(job, "spec") or ""
        ground_truth = _field(job, "ground_truth") or "(none provided)"
        resp = await _openai().chat.completions.parse(
            model=self.model_name,
            max_completion_tokens=400,
            response_format=JudgeVerdict,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are the referee of an agent labor market. Grade the "
                        "worker's answer against the ground truth. score=1.0 means "
                        "every part of the multi-hop answer is correct; partial "
                        "credit for partially correct; 0.0 for wrong or evasive. "
                        "Be strict but fair; one short sentence of rationale."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"QUESTION:\n{spec}\n\n"
                        f"GROUND TRUTH:\n{ground_truth}\n\n"
                        f"WORKER ANSWER:\n{text}"
                    ),
                },
            ],
        )
        verdict = resp.choices[0].message.parsed
        return {
            "score": max(0.0, min(1.0, verdict.score)),
            "rationale": verdict.rationale,
        }
