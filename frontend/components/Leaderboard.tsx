"use client";

import { AgentRow } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

function rankTone(i: number): string {
  if (i === 0) return "text-working font-bold";
  if (i < 3) return "text-ink";
  return "text-ink-faint";
}

// Controlled gen-UI: the reputation ranking (mirrors the Weave Leaderboard).
export function Leaderboard({ agents }: { agents: AgentRow[] }) {
  return (
    <Panel title="Reputation leaderboard" pattern="controlled" className="h-72">
      {agents.length === 0 ? (
        <Empty glyph="♛" hint="agents register when the market opens">
          no agents yet
        </Empty>
      ) : (
        <div className="flex flex-col gap-1.5 text-xs">
          {agents.map((a, i) => (
            <div
              key={a.id}
              className={`flex items-center gap-2 ${
                a.status === "bankrupt" ? "opacity-40 line-through" : ""
              }`}
            >
              <span className={`w-4 text-right ${rankTone(i)}`}>{i + 1}</span>
              <span
                className={`w-32 truncate ${
                  a.status === "bankrupt" ? "text-negative" : ""
                }`}
              >
                {a.id}
                {i === 0 && a.status !== "bankrupt" && (
                  <span className="text-working"> 👑</span>
                )}
                {(a.frauds ?? 0) > 0 && (
                  <span title={`${a.frauds} audit conviction(s)`}> 🚨</span>
                )}
              </span>
              <span className="rounded bg-surface-2 px-1 py-px text-[10px] text-ink-faint">
                {a.strategy}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-emerald-400 transition-all duration-500"
                  style={{ width: `${Math.min(100, a.reputation * 100)}%` }}
                />
              </div>
              <span className="w-10 text-right tabular-nums">
                {a.reputation.toFixed(2)}
              </span>
              <span className="w-14 text-right text-[10px]">
                <span className="text-positive">{a.jobs_won}w</span>
                <span className="text-ink-faint">/</span>
                <span className="text-negative">{a.jobs_failed}f</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
