"""weave.Monitor — continuous online evaluation over live market traffic.

Registers a Monitor that runs the SubmissionGuardrail (programmatic, so it
needs no server-side LLM) against every live Worker.execute_job call. This
is the "online evals" surface of Weave: the same scorer that gates payment
also watches production traffic continuously.

Best-effort: a Monitor failure must never take down the market, so
activation is wrapped and logged.
"""
import weave

from canopy.scoring.scorers import SubmissionGuardrail

_activated = False


def activate_guardrail_monitor() -> None:
    global _activated
    if _activated:
        return
    try:
        monitor = weave.Monitor(
            name="canopy-guardrail-monitor",
            description=(
                "Runs the submission guardrail over live execute_job traffic. "
                "The same scorer gates escrow release; failures feed the "
                "reputation penalties that drive bankruptcy."
            ),
            sampling_rate=1.0,
            op_names=["Worker.execute_job"],
            scorers=[SubmissionGuardrail()],
        )
        monitor.activate()
        _activated = True
        print("✓ weave.Monitor active: canopy-guardrail-monitor")
    except Exception as exc:  # noqa: BLE001 — monitor is additive, never fatal
        print(f"weave.Monitor activation skipped: {exc}")
