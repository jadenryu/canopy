"use client";

import { useMemo } from "react";

import { STATUS } from "@/lib/status";
import { AgentRow, JobRow } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

// Subcontract chains — the recursive-hiring showcase. Only jobs that
// actually spawned sub-jobs appear; each tree reads client → manager →
// subcontractors with real names and prices.
export function HiringGraph({
  jobs,
  agents,
}: {
  jobs: JobRow[];
  agents: AgentRow[];
}) {
  const label = useMemo(() => {
    const m = new Map(agents.map((a) => [a.id, a.label || a.id]));
    m.set("human", "client");
    return (id: string | null) => (id ? (m.get(id) ?? id) : "…");
  }, [agents]);

  const { chains, children } = useMemo(() => {
    const children = new Map<string, JobRow[]>();
    for (const j of jobs) {
      if (!j.parent_job_id) continue;
      const list = children.get(j.parent_job_id) ?? [];
      list.push(j);
      children.set(j.parent_job_id, list);
    }
    // a chain = a top-level job that actually subcontracted
    const chains = jobs.filter((j) => !j.parent_job_id && children.has(j.id));
    return { chains, children };
  }, [jobs]);

  const render = (job: JobRow, depth: number): React.ReactNode => {
    const s = STATUS[job.status];
    const kids = children.get(job.id) ?? [];
    return (
      <div key={job.id}>
        <div
          className={`flex items-baseline gap-2 py-1 ${
            depth > 0 ? "text-[11px]" : "text-xs"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 translate-y-px rounded-full ${s?.dot ?? "bg-edge-2"} ${
              job.status === "executing" ? "animate-pulse-dot" : ""
            }`}
          />
          <span className="shrink-0 text-ink-dim">{label(job.client_id)}</span>
          <span className="shrink-0 text-ink-faint">hired</span>
          <span className="truncate text-ink">{label(job.winner_id)}</span>
          {job.price > 0 && (
            <span
              className={`num shrink-0 ${
                job.status === "settled" ? "text-positive" : "text-ink-faint"
              }`}
            >
              {job.price.toFixed(2)}
            </span>
          )}
          {depth === 0 && (
            <span className="num ml-auto shrink-0 text-[10px] text-ink-faint">
              {job.id}
            </span>
          )}
        </div>
        {depth === 0 && (
          <p className="line-clamp-1 pl-3.5 text-[10px] text-ink-faint">{job.spec}</p>
        )}
        {kids.length > 0 && (
          <div className="ml-[3px] border-l border-edge pl-3">
            {kids.map((c) => render(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Panel
      title="Subcontract chains"
      subtitle="recursive hiring — a winner becomes a client"
      pattern="controlled"
      className="h-72"
    >
      {chains.length === 0 ? (
        <Empty hint="Managers win complex 3-hop jobs, decompose them, and hire workers through the same auctions. Those chains appear here.">
          No subcontracts yet
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">{chains.map((j) => render(j, 0))}</div>
      )}
    </Panel>
  );
}
