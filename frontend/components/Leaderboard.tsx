"use client";

import { AgentRow } from "@/lib/useMarketState";
import { Panel } from "./Panel";

// Controlled gen-UI: the reputation ranking (mirrors the Weave Leaderboard).
export function Leaderboard({ agents }: { agents: AgentRow[] }) {
  return (
    <Panel title="Reputation leaderboard" pattern="controlled" className="h-72">
      <div className="flex flex-col gap-1.5 text-xs">
        {agents.map((a, i) => (
          <div
            key={a.id}
            className={`flex items-center gap-2 ${
              a.status === "bankrupt" ? "opacity-40 line-through" : ""
            }`}
          >
            <span className="w-4 text-neutral-500">{i + 1}</span>
            <span className="w-32 truncate">{a.id}</span>
            <span className="w-20 text-neutral-500">{a.strategy}</span>
            <div className="h-1.5 flex-1 rounded bg-neutral-900">
              <div
                className="h-full rounded bg-green-600 transition-all duration-500"
                style={{ width: `${Math.min(100, a.reputation * 100)}%` }}
              />
            </div>
            <span className="w-10 text-right">{a.reputation.toFixed(2)}</span>
            <span className="w-14 text-right text-neutral-500">
              {a.jobs_won}w/{a.jobs_failed}f
            </span>
          </div>
        ))}
        {agents.length === 0 && (
          <div className="py-4 text-center text-neutral-600">no agents yet</div>
        )}
      </div>
    </Panel>
  );
}
