"use client";

import { AgentRow } from "@/lib/useMarketState";
import { Panel } from "./Panel";

// Controlled gen-UI: live balances. Bankrupt = the bar bled out.
export function Wallets({ agents }: { agents: AgentRow[] }) {
  const max = Math.max(100, ...agents.map((a) => a.balance));
  const sorted = [...agents].sort((a, b) => b.balance - a.balance);
  return (
    <Panel title="Wallets" pattern="controlled" className="h-72">
      <div className="flex flex-col gap-1.5 text-xs">
        {sorted.map((a) => (
          <div key={a.id} className="flex items-center gap-2">
            <span className="w-32 truncate">{a.id}</span>
            <div className="h-1.5 flex-1 rounded bg-neutral-900">
              <div
                className={`h-full rounded transition-all duration-500 ${
                  a.status === "bankrupt"
                    ? "bg-red-700"
                    : a.balance >= 100
                      ? "bg-emerald-600"
                      : "bg-amber-600"
                }`}
                style={{ width: `${Math.max(1, (Math.max(0, a.balance) / max) * 100)}%` }}
              />
            </div>
            <span
              className={`w-16 text-right ${
                a.status === "bankrupt" ? "text-red-500" : ""
              }`}
            >
              {a.balance.toFixed(2)}
            </span>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="py-4 text-center text-neutral-600">no agents yet</div>
        )}
      </div>
    </Panel>
  );
}
