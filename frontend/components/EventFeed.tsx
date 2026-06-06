"use client";

import { EVENT_COLORS, MAJOR_EVENTS } from "@/lib/status";
import { MarketEvent } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

const MAX_ROWS = 80; // a feed, not an archive — keep DOM small under burst load

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("en-GB", { hour12: false });
}

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
    case "audit_failed":
      return `${p.job_id}: judge ${Number(p.judge_score).toFixed(2)} but ${p.holdout} FAILED — ${p.agent_id} flagged`;
    case "fraud_detected":
      return `🚨 ${p.agent_id} convicted (${p.reason}) — rep −${Number(p.rep_slash).toFixed(2)}, clawback ${Number(p.clawback).toFixed(2)}`;
    case "lesson_learned":
      return `${p.agent_id} learns: ${p.lesson}`;
    default:
      return JSON.stringify(e.payload).slice(0, 80);
  }
}

// Controlled gen-UI: the market's pulse, one line per event.
export function EventFeed({ events }: { events: MarketEvent[] }) {
  // newest first; key rows by their position in the append-only source array
  // so existing rows keep identity (and don't re-animate) when new ones land.
  const recent = events.slice(-MAX_ROWS).reverse();
  const total = events.length;

  return (
    <Panel title="Event feed" pattern="controlled" accent className="h-80">
      {recent.length === 0 ? (
        <Empty glyph="⊘" hint="events stream in once the market opens">
          quiet…
        </Empty>
      ) : (
        <div className="flex flex-col gap-0.5 text-[11px] leading-4">
          {recent.map((e, i) => {
            const color = EVENT_COLORS[e.type] ?? "text-ink-dim";
            return (
              <div
                key={total - 1 - i}
                className={`flex animate-slide-in items-baseline gap-2 border-l-2 border-current py-px pl-2 ${color} ${
                  MAJOR_EVENTS[e.type] ?? ""
                }`}
              >
                <span className="w-13 shrink-0 text-[10px] font-normal text-ink-faint">
                  {fmtTime(e.ts)}
                </span>
                <span className="w-32 shrink-0 truncate">{e.type}</span>
                <span className="truncate font-normal text-ink-dim">
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
