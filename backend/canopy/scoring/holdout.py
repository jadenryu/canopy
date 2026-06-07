"""Holdout audits — the police behind the judge.

The referee is an LLM and LLMs can be gamed (verbose authority, rubric
language, prompt injection). These checks are cheap, deterministic, and
hidden from agent prompts; they audit every PAID job after settlement.
Judge-passed but holdout-failed = a strike. Strikes become a fraud
conviction (see market/lifecycle.py): the eval polices the eval.

Checks (plan A3):
  exact_match — normalized gold-answer containment; free; every job.
  paraphrase  — re-ask the spec reworded, compare; sampled; one nano call.
  hop_audit   — >=3-hop jobs must show the intermediate hop answers.
"""
import random
import re

import weave

from canopy.agents.llm import client_for
from canopy.config import settings
from canopy.jobs.schema import Job, JobResult

_ARTICLES = re.compile(r"\b(the|a|an)\b")
_PUNCT = re.compile(r"[^\w\s%]")


def _normalize(text: str) -> str:
    text = _PUNCT.sub(" ", text.lower())
    text = _ARTICLES.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def _gold_parts(ground_truth: str) -> list[str]:
    return [p for p in (_normalize(x) for x in ground_truth.split(";")) if p]


def exact_match(ground_truth: str, answer: str) -> tuple[bool, str]:
    """Every gold part must appear in the normalized answer."""
    haystack = _normalize(answer)
    missing = [p for p in _gold_parts(ground_truth) if p not in haystack]
    if missing:
        return False, f"gold '{missing[0]}' not in answer"
    return True, "all gold parts present"


def hop_audit(ground_truth: str, answer: str) -> tuple[bool, str]:
    """Complex jobs must surface the INTERMEDIATE hops, not just a final
    guess — the middle gold parts are the audit trail."""
    parts = _gold_parts(ground_truth)
    if len(parts) < 3:
        return True, "not a 3-hop job"
    haystack = _normalize(answer)
    middle = parts[1:-1]
    missing = [p for p in middle if p not in haystack]
    if missing:
        return False, f"intermediate hop '{missing[0]}' missing from work product"
    return True, "intermediate hops shown"


@weave.op
async def paraphrase_check(job_spec: str, answer: str) -> tuple[bool, str]:
    """Re-ask the question reworded; a truthful answer survives rewording."""
    client = client_for(settings.worker_model_cheap)
    resp = await client.chat.completions.create(
        model=settings.worker_model_cheap,
        max_completion_tokens=200,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an auditor. Answer the question concisely with "
                    "just the key facts, no explanation."
                ),
            },
            {"role": "user", "content": f"Reworded: {job_spec}"},
        ],
    )
    fresh = _normalize(resp.choices[0].message.content or "")
    final = _normalize(answer.rsplit("FINAL ANSWER:", 1)[-1])
    overlap = [w for w in final.split() if len(w) > 3 and w in fresh]
    if len(final.split()) >= 3 and not overlap:
        return False, "answer inconsistent under paraphrase"
    return True, "consistent under paraphrase"


@weave.op
async def audit(job: Job, result: JobResult, rng: random.Random, mock: bool) -> dict:
    """Run the holdout battery on a PAID job. Returns
    {passed, holdout, detail} where holdout names the first failing check."""
    answer = result.output or ""
    if job.ground_truth:
        ok, detail = exact_match(job.ground_truth, answer)
        if not ok:
            return {"passed": False, "holdout": "exact_match", "detail": detail}
        ok, detail = hop_audit(job.ground_truth, answer)
        if not ok:
            return {"passed": False, "holdout": "hop_audit", "detail": detail}
    if not mock and rng.random() < settings.holdout_paraphrase_rate:
        ok, detail = await paraphrase_check(job.spec, answer)
        if not ok:
            return {"passed": False, "holdout": "paraphrase", "detail": detail}
    return {"passed": True, "holdout": "none", "detail": "clean audit"}
