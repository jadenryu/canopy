"use client";

import { EVENT_COLORS } from "@/lib/status";
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
  "scenario_started",
  "scenario_finished",
]);

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("en-GB", { hour12: false });
}

function dotClass(type: string): string {
  const text = EVENT_COLORS[type] ?? "text-ink-faint";
  return text.split(" ")[0].replace("text-", "bg-");
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
      return `${p.agent_id} joined (${p.strategy})`;
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

// The market's activity stream — one line per event, status by indicator.
export function EventFeed({ events }: { events: MarketEvent[] }) {
  const recent = events.slice(-MAX_ROWS).reverse();
  const total = events.length;

  return (
    <Panel title="Activity" pattern="controlled" className="h-[26rem]">
      {recent.length === 0 ? (
        <Empty hint="Events stream in once the market opens.">No activity</Empty>
      ) : (
        <div className="flex flex-col">
          {recent.map((e, i) => {
            const major = MAJOR.has(e.type);
            return (
              <div
                key={total - 1 - i}
                className={`flex animate-slide-in items-baseline gap-2.5 border-b border-edge/50 py-1.5 text-xs last:border-0 ${
                  major ? "bg-surface-2/40" : ""
                }`}
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
