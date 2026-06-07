"""Core market datatypes. Job domain: multi-hop benchmark questions —
ground-truth answers make scoring objective, multi-hop structure makes
jobs decomposable (subcontracting)."""
from enum import StrEnum

from pydantic import BaseModel, Field


class JobStatus(StrEnum):
    OPEN = "open"
    AWARDED = "awarded"
    EXECUTING = "executing"
    VERIFYING = "verifying"
    REJECTED = "rejected"
    SETTLED = "settled"
    FAILED = "failed"


class Job(BaseModel):
    id: str
    spec: str  # the question text
    requirements: list[str] = Field(default_factory=list)
    category: str = "general"
    hops: int = 2  # complexity = number of reasoning hops; >=3 attracts managers
    bounty_cap: float = 10.0
    deadline_ts: float | None = None
    status: JobStatus = JobStatus.OPEN
    client_id: str = "human"
    winner_id: str | None = None
    escrow_amount: float = 0.0
    parent_job_id: str | None = None
    depth: int = 0
    ground_truth: str | None = None  # held-out answer for eval; never shown to workers
    trace_id: str | None = None  # Weave call id of the execution — judge-facing proof


class Bid(BaseModel):
    job_id: str
    agent_id: str
    price: float
    effective_bid: float  # price / rep_weight(reputation)


class JobResult(BaseModel):
    job_id: str
    agent_id: str
    output: str
    score: float | None = None
    rationale: str | None = None
