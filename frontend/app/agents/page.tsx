"use client";

import { useMemo, useState } from "react";

import { AgentSheet, JobSheet } from "@/components/Inspector";
import { Panel } from "@/components/Panel";
import { useMarketState } from "@/lib/useMarketState";

const STRATEGY_NOTES: Record<string, string> = {
  specialist: "Bids only inside its home category, priced sharp.",
  undercutter: "Prices just below the last clearing price.",
  generalist: "Bids on everything at a standard margin.",
  premium: "Charges more and stakes its reputation on quality.",
  manager: "Wins complex jobs, decomposes them, and hires subcontractors.",
  lowballer: "Always bids the floor price — volume over quality.",
};

// The roster — every agent's role, economics, and learning, readable
// without clicking anything. Click a row for the full dossier.
export default function AgentsPage() {
  const { state } = useMarketState();
  const [agentId, setAgentId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const agents = useMemo(() => state?.agents ?? [], [state?.agents]);
  const jobs = useMemo(() => state?.jobs ?? [], [state?.jobs]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Agents</h1>
        <p className="text-xs text-ink-faint">
          Every participant in the market — house workers, managers, and
          human-fielded challengers. Reputation derives from Weave referee
          scores; balances move only through escrow.
        </p>
      </div>

      <div className="flex flex-wrap items-center divide-x divide-edge">
        {(() => {
          const active = agents.filter((a) => a.status === "active");
          const stats = [
            { label: "Active", value: active.length },
            {
              label: "Bankrupt",
              value: agents.filter((a) => a.status === "bankrupt").length,
            },
            {
              label: "Audit convictions",
              value: agents.reduce((s, a) => s + (a.frauds ?? 0), 0),
            },
            {
              label: "Avg reputation",
              value: active.length
                ? (
                    active.reduce((s, a) => s + a.reputation, 0) / active.length
                  ).toFixed(2)
                : "—",
            },
            {
              label: "Lessons learned",
              value: agents.reduce((s, a) => s + (a.lessons?.length ?? 0), 0),
            },
          ];
          return stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5 px-5 first:pl-1">
              <span className="text-[11px] text-ink-faint">{s.label}</span>
              <span className="num text-xl font-medium text-ink">{s.value}</span>
            </div>
          ));
        })()}
      </div>

      <Panel title="Roster" subtitle={`${agents.filter((a) => a.status === "active").length} active · ${agents.length} ever registered`} pattern="controlled">
        {agents.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-faint">
            No agents yet — run a scenario from the header.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-3 font-medium">Agent</th>
                <th className="pb-2 pr-3 font-medium">Strategy</th>
                <th className="pb-2 pr-3 font-medium">Model</th>
                <th className="pb-2 pr-3 text-right font-medium">Reputation</th>
                <th className="pb-2 pr-3 text-right font-medium">Balance</th>
                <th className="pb-2 pr-3 text-right font-medium">Won / Failed</th>
                <th className="pb-2 pr-3 font-medium">Latest lesson</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => {
                const out = a.status !== "active";
                const lesson = a.lessons?.[a.lessons.length - 1];
                return (
                  <tr
                    key={a.id}
                    onClick={() => setAgentId(a.id)}
                    className={`cursor-pointer border-t border-edge/60 transition-colors hover:bg-surface-2/60 ${
                      out ? "opacity-50" : ""
                    }`}
                  >
                    <td className="py-2.5 pr-3">
                      <div className="text-ink">{a.label}</div>
                      <div className="num text-[10px] text-ink-faint">{a.id}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="text-ink-dim">{a.strategy}</div>
                      <div className="max-w-52 text-[10px] text-ink-faint">
                        {STRATEGY_NOTES[a.strategy] ?? ""}
                      </div>
                    </td>
                    <td className="num py-2.5 pr-3 text-[11px] text-ink-dim">
                      {a.model_tier}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <span className="num text-ink">{a.reputation.toFixed(3)}</span>
                      <div className="mt-1 ml-auto h-1 w-16 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-canopy/70"
                          style={{ width: `${Math.min(100, a.reputation * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="num py-2.5 pr-3 text-right text-ink">
                      {a.balance.toFixed(2)}
                    </td>
                    <td className="num py-2.5 pr-3 text-right text-ink-dim">
                      {a.jobs_won} / {a.jobs_failed}
                    </td>
                    <td className="max-w-56 py-2.5 pr-3 text-[11px] text-ink-faint">
                      {lesson ? `“${lesson.lesson}”` : "—"}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] ${
                          a.status === "active"
                            ? "border-canopy/40 text-canopy"
                            : "border-negative/40 text-negative"
                        }`}
                      >
                        {a.status}
                      </span>
                      {(a.frauds ?? 0) > 0 && (
                        <span className="ml-1.5 rounded border border-negative/40 px-1.5 py-0.5 text-[10px] text-negative">
                          {a.frauds} conviction{(a.frauds ?? 0) > 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <AgentSheet
        agent={agents.find((a) => a.id === agentId) ?? null}
        jobs={jobs}
        open={agentId !== null}
        onClose={() => setAgentId(null)}
        onSelectJob={(id) => {
          setAgentId(null);
          setJobId(id);
        }}
      />
      <JobSheet
        job={jobs.find((j) => j.id === jobId) ?? null}
        open={jobId !== null}
        onClose={() => setJobId(null)}
        onSelectAgent={(id) => {
          setJobId(null);
          setAgentId(id);
        }}
      />
    </div>
  );
}
