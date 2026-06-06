"use client";

import { JobRow } from "@/lib/useMarketState";
import { Panel } from "./Panel";

const STATUS_COLORS: Record<string, string> = {
  open: "text-sky-400",
  awarded: "text-amber-400",
  executing: "text-amber-300",
  verifying: "text-violet-400",
  settled: "text-green-500",
  rejected: "text-red-500",
  failed: "text-red-400",
};

// Controlled gen-UI: a fixed widget; the market only feeds it data.
export function OrderBook({ jobs }: { jobs: JobRow[] }) {
  const recent = [...jobs].reverse().slice(0, 24);
  return (
    <Panel title="Order book" pattern="controlled" className="h-72">
      <table className="w-full text-left text-xs">
        <thead className="text-neutral-500">
          <tr>
            <th className="pb-1 pr-2">job</th>
            <th className="pb-1 pr-2">category</th>
            <th className="pb-1 pr-2">bids</th>
            <th className="pb-1 pr-2">winner</th>
            <th className="pb-1 pr-2 text-right">price</th>
            <th className="pb-1">status</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((j) => (
            <tr key={j.id} className="border-t border-neutral-900">
              <td className="py-1 pr-2 text-neutral-400">{j.id}</td>
              <td className="py-1 pr-2">{j.category}{j.hops >= 3 ? " ★" : ""}</td>
              <td className="py-1 pr-2">{j.bids.length}</td>
              <td className="py-1 pr-2">{j.winner_id ?? "—"}</td>
              <td className="py-1 pr-2 text-right">
                {j.price ? j.price.toFixed(2) : "—"}
              </td>
              <td className={`py-1 ${STATUS_COLORS[j.status] ?? ""}`}>{j.status}</td>
            </tr>
          ))}
          {recent.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-neutral-600">
                no jobs yet — run a scenario
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}
