"""Publish agent reputation as a native Weave Leaderboard.

Each agent is logged as a Model via weave.EvaluationLogger against ONE
shared job dataset, with the referee's scores attached per prediction.
A weave Leaderboard object then ranks agents by JobQualityScorer.mean —
the market's reputation ranking as a Weave-native, eval-backed artifact.

Verified against weave 0.52.42: EvaluationLogger pseudo-evaluations are
real Evaluation objects, so LeaderboardColumn.evaluation_object_ref can
point at them; rows = the Models (= agents) that logged against them.
"""
import re

import weave
from weave import EvaluationLogger
from weave.flow.leaderboard import Leaderboard, LeaderboardColumn
from weave.trace.weave_client import get_ref

SCORER_NAME = "JobQualityScorer"
LEADERBOARD_NAME = "canopy-reputation"


def _model_name(agent_id: str) -> str:
    return re.sub(r"\W", "_", agent_id)


def publish_reputation_leaderboard(
    dataset_rows: list[dict],
    records_by_agent: dict[str, list[dict]],
) -> str | None:
    """records_by_agent: agent_id -> [{job_id, spec, output, score}, ...].

    Returns the published leaderboard ref URI (or None if nothing to rank).
    """
    eval_refs: list[str] = []
    for agent_id, records in records_by_agent.items():
        if not records:
            continue
        ev = EvaluationLogger(
            name=LEADERBOARD_NAME,
            model=_model_name(agent_id),
            dataset=dataset_rows,
        )
        for rec in records:
            pred = ev.log_prediction(
                inputs={"job_id": rec["job_id"], "spec": rec["spec"]},
                output=rec["output"],
            )
            pred.log_score(SCORER_NAME, rec["score"])
            pred.finish()
        ev.log_summary()
        ref = get_ref(ev._pseudo_evaluation)
        if ref is not None and ref.uri not in eval_refs:
            eval_refs.append(ref.uri)

    if not eval_refs:
        return None

    board = Leaderboard(
        name=LEADERBOARD_NAME,
        description=(
            "Agent reputation ranking — referee (JobQualityScorer) mean score "
            "per agent. This IS the market's trust signal: it discounts "
            "effective bids and decides who wins auctions."
        ),
        columns=[
            LeaderboardColumn(
                evaluation_object_ref=ref,
                scorer_name=SCORER_NAME,
                summary_metric_path="mean",
            )
            for ref in eval_refs
        ],
    )
    published = weave.publish(board, LEADERBOARD_NAME)
    return published.uri()
