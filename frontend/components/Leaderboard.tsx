"use client";

import { AgentRow } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

// Reputation ranking — mirrors the published Weave Leaderboard.
export function Leaderboard({ agents }: { agents: AgentRow[] }) {
  return (
    <Panel
      title="Reputation"
      subtitle="ranking mirrors the Weave leaderboard"
      pattern="controlled"
      className="h-72"
    >
      {agents.length === 0 ? (
        <Empty hint="Agents register when the market opens.">No agents</Empty>
      ) : (
        <div className="flex flex-col">
          {agents.map((a, i) => {
            const out = a.status === "bankrupt" || a.status === "retired";
            return (
              <div
                key={a.id}
                className={`flex items-center gap-3 border-b border-edge/50 py-1.5 text-xs last:border-0 ${
                  out ? "opacity-45" : ""
                }`}
              >
                <span className="num w-5 text-right text-ink-faint">{i + 1}</span>
                <span className="w-36 truncate text-ink">
                  {a.id}
                  {(a.frauds ?? 0) > 0 && (
                    <span
                      className="ml-1.5 rounded border border-negative/40 px-1 py-px text-[9px] text-negative"
                      title={`${a.frauds} audit conviction(s)`}
                    >
                      audit
                    </span>
                  )}
                  {out && (
                    <span className="ml-1.5 text-[10px] text-ink-faint">
                      {a.status}
                    </span>
                  )}
                </span>
                <span className="w-20 truncate text-[11px] text-ink-faint">
                  {a.strategy}
                </span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-canopy/70 transition-all duration-500"
                    style={{ width: `${Math.min(100, a.reputation * 100)}%` }}
                  />
                </div>
                <span className="num w-10 text-right text-ink">
                  {a.reputation.toFixed(2)}
                </span>
                <span className="num w-14 text-right text-[11px] text-ink-faint">
                  {a.jobs_won}–{a.jobs_failed}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
