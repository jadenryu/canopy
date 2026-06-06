"use client";

import { STATUS } from "@/lib/status";
import { JobRow } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

// Controlled gen-UI: who-hires-whom. Nesting = subcontract depth.
export function HiringGraph({ jobs }: { jobs: JobRow[] }) {
  const children = new Map<string, JobRow[]>();
  const top: JobRow[] = [];
  for (const j of jobs) {
    if (j.parent_job_id) {
      const list = children.get(j.parent_job_id) ?? [];
      list.push(j);
      children.set(j.parent_job_id, list);
    } else {
      top.push(j);
    }
  }

  const render = (job: JobRow, depth: number): React.ReactNode => {
    const s = STATUS[job.status];
    const kids = children.get(job.id) ?? [];
    return (
      <div key={job.id}>
        <div
          className={`flex items-center gap-2 py-0.5 ${
            depth > 0 ? "text-[11px] text-ink-dim" : "text-xs"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${s?.dot ?? "bg-edge-2"} ${
              job.status === "executing" ? "animate-pulse-dot" : ""
            }`}
          />
          <span className="text-ink-dim">{job.client_id}</span>
          <span className="text-ink-faint">→</span>
          <span className="text-ink">{job.winner_id ?? "…"}</span>
          <span className="text-ink-faint">[{job.id}]</span>
          {job.price > 0 && (
            <span
              className={`tabular-nums ${
                job.status === "settled" ? "text-positive" : "text-ink-faint"
              }`}
            >
              @ {job.price.toFixed(2)}
            </span>
          )}
        </div>
        {kids.length > 0 && (
          <div className="ml-[7px] border-l border-edge pl-3">
            {kids.map((c) => render(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Panel title="Hiring graph" pattern="controlled" className="h-72">
      {top.length === 0 ? (
        <Empty glyph="⌥" hint="subcontracts nest under their parent job">
          no hires yet
        </Empty>
      ) : (
        top.map((j) => render(j, 0))
      )}
    </Panel>
  );
}
