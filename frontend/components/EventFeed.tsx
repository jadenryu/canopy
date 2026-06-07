"use client";

import { useState } from "react";

import { MarketEvent } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

const MAX_ROWS = 80; // a stream, not an archive — keep the DOM small

// events that warrant emphasis in the stream
const MAJOR = new Set([
  "shock",
  "bankruptcy",
  "fork",
  "fraud_detected",
  "collusion_flagged",
  "scenario_started",
  "scenario_finished",
]);

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("en-GB", { hour12: false });
}

// literal classes only — Tailwind generates utilities it can SEE in source
const EVENT_DOT: Record<string, string> = {
  job_posted: "bg-info",
  bid_placed: "bg-ink-dim",
  awarded: "bg-working",
  executing: "bg-working",
  scored: "bg-verify",
  settled: "bg-positive",
  rejected: "bg-negative",
  failed: "bg-negative",
  penalty: "bg-negative",
  bankruptcy: "bg-negative",
  fork: "bg-positive",
  reputation_update: "bg-ink-faint",
  price_update: "bg-positive",
  escrow_hold: "bg-ink-faint",
  escrow_release: "bg-ink-faint",
  escrow_refund: "bg-ink-faint",
  agent_registered: "bg-info",
  scenario_started: "bg-special",
  scenario_finished: "bg-special",
  report_ready: "bg-special",
  shock: "bg-negative",
  audit_failed: "bg-working",
  fraud_detected: "bg-negative",
  lesson_learned: "bg-canopy",
  approval_required: "bg-working",
  approval_resolved: "bg-working",
  bench_run_started: "bg-special",
  bench_run_finished: "bg-special",
  paused: "bg-working",
  resumed: "bg-canopy",
  liquidity: "bg-positive",
  reserve_price: "bg-info",
  custom_agents_removed: "bg-ink-faint",
  collusion_flagged: "bg-negative",
  chat: "bg-ink-faint",
};

function dotClass(type: string): string {
  return EVENT_DOT[type] ?? "bg-ink-faint";
}

function summarize(e: MarketEvent): string {
  const p = e.payload as Record<string, string | number>;
  switch (e.type) {
    case "job_posted":
      return `${p.job_id} posted in ${p.category} — cap ${Number(p.bounty_cap).toFixed(2)}`;
    case "bid_placed":
      return `${p.agent_id} bid ${Number(p.price).toFixed(2)} on ${p.job_id} (effective ${Number(p.effective_bid).toFixed(2)})`;
    case "awarded":
      return `${p.job_id} awarded to ${p.winner_id} at ${Number(p.price).toFixed(2)}`;
    case "executing":
      return `${p.agent_id} executing ${p.job_id}`;
    case "scored":
      return `${p.job_id} scored ${Number(p.score).toFixed(2)} — ${p.rationale ?? ""}`;
    case "settled":
      return `${p.job_id} settled — ${p.agent_id} paid ${Number(p.amount).toFixed(2)}`;
    case "rejected":
      return `${p.job_id} rejected before payment (${p.agent_id})`;
    case "penalty":
      return `${p.agent_id} fined ${Number(p.amount).toFixed(2)} — ${p.reason}`;
    case "bankruptcy":
      return `${p.agent_id} declared bankrupt`;
    case "fork":
      return `${p.parent_id} forked a new agent: ${p.child_id}`;
    case "price_update":
      return `${p.category} (${p.hops ?? "?"}-hop) cleared at ${Number(p.price).toFixed(2)}`;
    case "audit_failed":
      return `audit strike on ${p.agent_id} — ${p.holdout}: ${p.detail ?? ""}`;
    case "fraud_detected":
      return `${p.agent_id} convicted of reward hacking — ${Number(p.clawback ?? 0).toFixed(2)} clawed back`;
    case "lesson_learned":
      return `${p.agent_id} recorded a lesson: ${p.lesson}`;
    case "agent_registered":
      return p.mid_run
        ? `${p.agent_id} entered mid-run (${p.model ?? p.strategy})`
        : `${p.agent_id} joined (${p.strategy})`;
    case "collusion_flagged":
      return `collusion flagged: ${(p.agents as unknown as string[])?.join(" ↔ ")} — reputation slashed`;
    case "shock":
      return `shock injected — ${p.kind}${p.agent_id ? `: ${p.agent_id}` : ""}`;
    case "approval_required":
      return `pending approval — ${p.label}`;
    case "approval_resolved":
      return `${p.approved ? "approved" : "rejected"}: ${p.label}`;
    case "scenario_started":
      return `scenario started — ${p.jobs} jobs, ${p.agents} agents`;
    case "scenario_finished":
      return "scenario complete";
    case "report_ready":
      return "analyst report filed";
    case "bench_run_started":
      return `benchmark run started — ${p.dataset}`;
    case "bench_run_finished":
      return "benchmark run complete";
    default:
      return JSON.stringify(e.payload).slice(0, 90);
  }
}

// money-moving / verdict events — what "Key" mode keeps
const KEY_EVENTS = new Set([
  ...MAJOR,
  "awarded",
  "settled",
  "rejected",
  "failed",
  "penalty",
  "audit_failed",
  "lesson_learned",
  "price_update",
  "report_ready",
]);

// pull the most relevant entity id out of an event payload
function entityOf(e: MarketEvent): { job?: string; agent?: string } {
  const p = e.payload as Record<string, string>;
  return {
    job: (p.job_id as string) || undefined,
    agent: (p.agent_id || p.winner_id || p.parent_id) as string | undefined,
  };
}

// The market's activity stream — one line per event, status by indicator.
// "Key" hides the bid/escrow firehose so the big moments stay readable.
// Rows are clickable: jump to the job or agent the event is about.
export function EventFeed({
  events,
  onSelectJob,
  onSelectAgent,
}: {
  events: MarketEvent[];
  onSelectJob?: (id: string) => void;
  onSelectAgent?: (id: string) => void;
}) {
  const [keyOnly, setKeyOnly] = useState(false);
  const visible = keyOnly ? events.filter((e) => KEY_EVENTS.has(e.type)) : events;
  const recent = visible.slice(-MAX_ROWS).reverse();
  const total = visible.length;

  return (
    <Panel
      title="Activity"
      pattern="controlled"
      className="h-[26rem]"
      subtitle={
          <button
            onClick={() => setKeyOnly((k) => !k)}
            className="pointer-events-auto rounded border border-edge px-1.5 py-0.5 text-[10px] text-ink-dim transition-colors hover:border-edge-2 hover:text-ink"
          >
            {keyOnly ? "showing key events" : "showing everything"}
          </button>
      }
    >
      {recent.length === 0 ? (
        <Empty hint="Events stream in once the market opens.">No activity</Empty>
      ) : (
        <div className="flex flex-col">
          {recent.map((e, i) => {
            const major = MAJOR.has(e.type);
            const { job, agent } = entityOf(e);
            const click = job && onSelectJob
              ? () => onSelectJob(job)
              : agent && onSelectAgent
                ? () => onSelectAgent(agent)
                : undefined;
            return (
              <div
                key={total - 1 - i}
                onClick={click}
                className={`flex animate-slide-in items-baseline gap-2.5 border-b border-edge/50 py-1.5 text-xs last:border-0 ${
                  major ? "bg-surface-2/40" : ""
                } ${click ? "cursor-pointer hover:bg-surface-2/60" : ""}`}
              >
                <span className="num shrink-0 text-[10px] text-ink-faint">
                  {fmtTime(e.ts)}
                </span>
                <span
                  className={`mt-px h-1.5 w-1.5 shrink-0 self-center rounded-full ${dotClass(e.type)}`}
                />
                <span className={`min-w-0 truncate ${major ? "text-ink" : "text-ink-dim"}`}>
                  {summarize(e)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
