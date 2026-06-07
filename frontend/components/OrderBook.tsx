"use client";

import { STATUS } from "@/lib/status";
import { JobRow } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

// Controlled gen-UI: a fixed widget; the market only feeds it data.
export function OrderBook({ jobs }: { jobs: JobRow[] }) {
  const recent = [...jobs].reverse().slice(0, 24);
  return (
    <Panel
      title="Order history"
      subtitle="every job this session, newest first"
      pattern="controlled"
      className="h-72"
    >
      {recent.length === 0 ? (
        <Empty hint="Open orders appear here.">
          No orders yet
        </Empty>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-ink-faint">
              <th className="pb-1 pr-2 font-medium">job</th>
              <th className="pb-1 pr-2 font-medium">category</th>
              <th className="pb-1 pr-2 font-medium">bids</th>
              <th className="pb-1 pr-2 font-medium">winner</th>
              <th className="pb-1 pr-2 text-right font-medium">price</th>
              <th className="pb-1 font-medium">status</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((j) => {
              const s = STATUS[j.status];
              return (
                <tr
                  key={j.id}
                  className="animate-flash-row border-t border-edge/60 transition-colors hover:bg-surface-2/60"
                >
                  <td className="py-1 pr-2 text-ink-dim">{j.id}</td>
                  <td className="py-1 pr-2">
                    {j.category}
                    {j.hops >= 3 && <span className="text-ink-faint"> · 3-hop</span>}
                  </td>
                  <td className="py-1 pr-2 text-ink-dim">{j.bids.length}</td>
                  <td className="py-1 pr-2">{j.winner_id ?? "—"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-ink">
                    {j.price ? j.price.toFixed(2) : "—"}
                  </td>
                  <td className="py-1">
                    <span className={`flex items-center gap-1.5 ${s?.text ?? ""}`}>
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          s?.dot ?? "bg-edge-2"
                        } ${j.status === "executing" ? "animate-pulse-dot" : ""}`}
                      />
                      {j.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
