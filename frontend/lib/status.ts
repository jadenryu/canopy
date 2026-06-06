// Single source of truth for status/event → color mappings.
// Replaces the three drifting maps that lived in OrderBook, HiringGraph
// and EventFeed (design_refresh_plan.md §3.3).

export const STATUS: Record<string, { text: string; dot: string }> = {
  open: { text: "text-info", dot: "bg-info" },
  awarded: { text: "text-working", dot: "bg-working" },
  executing: { text: "text-working", dot: "bg-working" },
  verifying: { text: "text-verify", dot: "bg-verify" },
  settled: { text: "text-positive", dot: "bg-positive" },
  rejected: { text: "text-negative", dot: "bg-negative" },
  failed: { text: "text-negative", dot: "bg-negative" },
};

export const EVENT_COLORS: Record<string, string> = {
  job_posted: "text-info",
  bid_placed: "text-ink-dim",
  awarded: "text-working",
  executing: "text-working",
  scored: "text-verify",
  settled: "text-positive",
  rejected: "text-negative",
  failed: "text-negative",
  penalty: "text-negative",
  bankruptcy: "text-negative font-bold",
  fork: "text-positive font-bold",
  reputation_update: "text-ink-faint",
  price_update: "text-positive",
  escrow_hold: "text-ink-faint",
  escrow_release: "text-ink-faint",
  escrow_refund: "text-ink-faint",
  agent_registered: "text-info",
  scenario_started: "text-special font-bold",
  scenario_finished: "text-special font-bold",
  report_ready: "text-special",
  shock: "text-negative font-bold",
  // reward-hacking police (judge passed, hidden holdout check failed)
  audit_failed: "text-working",
  fraud_detected: "text-negative font-bold",
  // self-improvement loop (agent ingests its Weave score + rationale)
  lesson_learned: "text-canopy",
};

// big moments get full-row emphasis in the EventFeed
export const MAJOR_EVENTS: Record<string, string> = {
  shock: "bg-negative/5",
  bankruptcy: "bg-negative/5",
  fork: "bg-positive/5",
  scenario_started: "bg-special/5",
  scenario_finished: "bg-special/5",
  fraud_detected: "bg-negative/5",
};
