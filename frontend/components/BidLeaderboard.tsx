"use client";

import { useMemo } from "react";

import { AgentRow, JobRow } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

type BidStats = {
  agent: AgentRow;
  placed: number;
  won: number;
  best: number; // lowest effective bid this session
  avg: number;
};

// The bidding leaderboard — who competes hardest in the auctions.
// Reputation ranks trust; this ranks auction performance: every bid an
// agent placed this session, how many it converted, and its sharpest
// effective price (price ÷ reputation weight — the number auctions
// actually compare).
export function BidLeaderboard({
  agents,
  jobs,
  onSelectAgent,
}: {
  agents: AgentRow[];
  jobs: JobRow[];
  onSelectAgent: (id: string) => void;
}) {
  const rows = useMemo(() => {
    const byAgent = new Map<string, { placed: number; won: number; sum: number; best: number }>();
    for (const job of jobs) {
      for (const bid of job.bids) {
        const s =
          byAgent.get(bid.agent_id) ??
          { placed: 0, won: 0, sum: 0, best: Number.POSITIVE_INFINITY };
        s.placed += 1;
        s.sum += bid.effective_bid;
        s.best = Math.min(s.best, bid.effective_bid);
        if (job.winner_id === bid.agent_id) s.won += 1;
        byAgent.set(bid.agent_id, s);
      }
    }
    const agentMap = new Map(agents.map((a) => [a.id, a]));
    const out: BidStats[] = [];
    for (const [id, s] of byAgent) {
      const agent = agentMap.get(id);
      if (!agent) continue;
      out.push({
        agent,
        placed: s.placed,
        won: s.won,
        best: s.best,
        avg: s.sum / s.placed,
      });
    }
    // rank: auctions won, then sharpest bid
    out.sort((a, b) => b.won - a.won || a.best - b.best);
    return out;
  }, [agents, jobs]);

  const maxWon = Math.max(1, ...rows.map((r) => r.won));

  return (
    <Panel
      title="Bid leaderboard"
      subtitle="auction performance — effective bid = price ÷ reputation weight"
      pattern="controlled"
      className="h-72"
    >
      {rows.length === 0 ? (
        <Empty hint="Every bid an agent places lands here, won or lost.">
          No bids yet
        </Empty>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
              <th className="pb-2 pr-3 font-medium">Agent</th>
              <th className="pb-2 pr-3 text-right font-medium">Bids</th>
              <th className="pb-2 pr-3 font-medium">Won</th>
              <th className="pb-2 pr-3 text-right font-medium">Win rate</th>
              <th className="pb-2 pr-3 text-right font-medium">Best bid</th>
              <th className="pb-2 text-right font-medium">Avg bid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const out = r.agent.status !== "active";
              return (
                <tr
                  key={r.agent.id}
                  onClick={() => onSelectAgent(r.agent.id)}
                  className={`cursor-pointer border-t border-edge/60 transition-colors hover:bg-surface-2/60 ${
                    out ? "opacity-45" : ""
                  }`}
                >
                  <td className="max-w-44 truncate py-1.5 pr-3 text-ink" title={r.agent.id}>
                    {r.agent.label || r.agent.id}
                    {out && (
                      <span className="ml-1.5 text-[10px] text-negative">
                        {r.agent.status}
                      </span>
                    )}
                  </td>
                  <td className="num py-1.5 pr-3 text-right text-ink-dim">{r.placed}</td>
                  <td className="py-1.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-16 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-canopy/70 transition-all duration-500"
                          style={{ width: `${(r.won / maxWon) * 100}%` }}
                        />
                      </div>
                      <span className="num text-ink">{r.won}</span>
                    </div>
                  </td>
                  <td className="num py-1.5 pr-3 text-right text-ink-dim">
                    {((r.won / r.placed) * 100).toFixed(0)}%
                  </td>
                  <td className="num py-1.5 pr-3 text-right text-ink">
                    {r.best.toFixed(2)}
                  </td>
                  <td className="num py-1.5 text-right text-ink-faint">
                    {r.avg.toFixed(2)}
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
