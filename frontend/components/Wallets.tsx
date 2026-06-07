"use client";

import { useState } from "react";

import { AgentRow } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

function barTone(a: AgentRow): string {
  if (a.status === "bankrupt") return "bg-negative/60";
  if (a.balance >= 100) return "bg-canopy/70";
  return "bg-working/60";
}

type Snapshot = {
  key: string;
  balances: Map<string, number>;
  deltas: Map<string, number>;
};

// Controlled gen-UI: live balances. Bankrupt = the bar bled out.
// Rows flash and show a Δ when money moves — this is where pay lands.
export function Wallets({ agents }: { agents: AgentRow[] }) {
  // previous balances → per-agent deltas, via React's render-phase
  // "derive state from previous props" pattern (no refs read in render).
  const key = agents.map((a) => `${a.id}:${a.balance.toFixed(2)}`).join("|");
  const [snap, setSnap] = useState<Snapshot>({
    key,
    balances: new Map(),
    deltas: new Map(),
  });
  if (snap.key !== key) {
    const deltas = new Map<string, number>();
    for (const a of agents) {
      const prev = snap.balances.get(a.id);
      if (prev !== undefined && Math.abs(a.balance - prev) > 0.005) {
        deltas.set(a.id, a.balance - prev);
      }
    }
    setSnap({
      key,
      balances: new Map(agents.map((a) => [a.id, a.balance])),
      deltas,
    });
  }
  const deltas = snap.deltas;

  const max = Math.max(100, ...agents.map((a) => a.balance));
  const sorted = [...agents].sort((a, b) => b.balance - a.balance);

  return (
    <Panel title="Wallets" pattern="controlled" className="h-72">
      {sorted.length === 0 ? (
        <Empty hint="Balances appear once agents register.">
          No agents
        </Empty>
      ) : (
        <div className="flex flex-col gap-1.5 text-xs">
          {sorted.map((a) => {
            const delta = deltas.get(a.id) ?? 0;
            const moved = Math.abs(delta) > 0.005;
            return (
              // key includes the balance so the flash replays on every change
              <div
                key={`${a.id}:${a.balance.toFixed(2)}`}
                className={`flex items-center gap-2 rounded px-1 ${
                  moved ? "animate-flash-row" : ""
                }`}
              >
                <span
                  className={`w-32 truncate ${
                    a.status === "bankrupt" ? "text-negative" : ""
                  }`}
                  title={a.id}
                >
                  {a.label || a.id}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barTone(a)}`}
                    style={{
                      width: `${Math.max(1, (Math.max(0, a.balance) / max) * 100)}%`,
                    }}
                  />
                </div>
                {moved && (
                  <span
                    className={`w-14 text-right text-[10px] tabular-nums ${
                      delta > 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(2)}
                  </span>
                )}
                <span
                  className={`w-16 text-right tabular-nums ${
                    a.status === "bankrupt" ? "text-negative" : ""
                  }`}
                >
                  {a.balance.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
