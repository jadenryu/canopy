"use client";

import { MarketEvent } from "@/lib/useMarketState";
import { Panel } from "./Panel";

const TYPE_COLORS: Record<string, string> = {
  job_posted: "text-sky-400",
  bid_placed: "text-neutral-400",
  awarded: "text-amber-400",
  executing: "text-amber-300",
  scored: "text-violet-400",
  settled: "text-green-500",
  rejected: "text-red-500",
  failed: "text-red-400",
  penalty: "text-red-400",
  bankruptcy: "text-red-600 font-bold",
  fork: "text-emerald-400 font-bold",
  reputation_update: "text-neutral-500",
  price_update: "text-green-400",
  escrow_hold: "text-neutral-500",
  escrow_release: "text-neutral-500",
  escrow_refund: "text-neutral-500",
  agent_registered: "text-sky-300",
  scenario_started: "text-fuchsia-400 font-bold",
  scenario_finished: "text-fuchsia-400 font-bold",
  report_ready: "text-fuchsia-400",
  shock: "text-red-500 font-bold",
};

function summarize(e: MarketEvent): string {
  const p = e.payload as Record<string, string | number>;
  switch (e.type) {
    case "job_posted":
      return `${p.job_id} (${p.category}) cap ${Number(p.bounty_cap).toFixed(2)}`;
    case "bid_placed":
      return `${p.agent_id} bids ${Number(p.price).toFixed(2)} on ${p.job_id} (eff ${Number(p.effective_bid).toFixed(2)})`;
    case "awarded":
      return `${p.job_id} → ${p.winner_id} @ ${Number(p.price).toFixed(2)}`;
    case "scored":
      return `${p.job_id}: ${Number(p.score).toFixed(2)} — ${p.rationale ?? ""}`;
    case "settled":
      return `${p.job_id}: ${p.agent_id} paid ${Number(p.amount).toFixed(2)}`;
    case "rejected":
      return `${p.job_id}: ${p.agent_id} REJECTED pre-payment`;
    case "penalty":
      return `${p.agent_id} fined ${Number(p.amount).toFixed(2)} (${p.reason})`;
    case "bankruptcy":
      return `${p.agent_id} is BANKRUPT (balance ${Number(p.balance).toFixed(2)})`;
    case "fork":
      return `${p.parent_id} forks → ${p.child_id}`;
    case "price_update":
      return `${p.category} h${p.hops ?? "?"} clears @ ${Number(p.price).toFixed(2)}`;
    default:
      return JSON.stringify(e.payload).slice(0, 80);
  }
}

// Controlled gen-UI: the market's pulse, one line per event.
export function EventFeed({ events }: { events: MarketEvent[] }) {
  const recent = [...events].reverse();
  return (
    <Panel title="Event feed" pattern="controlled" className="h-72">
      <div className="flex flex-col gap-0.5 text-[11px] leading-4">
        {recent.map((e, i) => (
          <div key={`${e.ts}-${i}`} className="flex gap-2">
            <span className={`w-36 shrink-0 ${TYPE_COLORS[e.type] ?? "text-neutral-400"}`}>
              {e.type}
            </span>
            <span className="truncate text-neutral-400">{summarize(e)}</span>
          </div>
        ))}
        {recent.length === 0 && (
          <div className="py-4 text-center text-neutral-600">quiet…</div>
        )}
      </div>
    </Panel>
  );
}
