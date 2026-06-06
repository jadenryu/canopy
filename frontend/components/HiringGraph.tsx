"use client";

import { JobRow } from "@/lib/useMarketState";
import { Panel } from "./Panel";

const STATUS_DOT: Record<string, string> = {
  settled: "bg-green-500",
  rejected: "bg-red-500",
  failed: "bg-red-400",
  executing: "bg-amber-400",
  awarded: "bg-amber-400",
  verifying: "bg-violet-400",
  open: "bg-sky-400",
};

// Controlled gen-UI: who-hires-whom. Indentation = subcontract depth.
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

  const render = (job: JobRow, depth: number): React.ReactNode => (
    <div key={job.id}>
      <div
        className="flex items-center gap-2 py-0.5 text-[11px]"
        style={{ paddingLeft: depth * 18 }}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[job.status] ?? "bg-neutral-600"}`} />
        <span className="text-neutral-500">{job.client_id}</span>
        <span className="text-neutral-600">→</span>
        <span>{job.winner_id ?? "…"}</span>
        <span className="text-neutral-600">
          [{job.id}] {job.price ? `@ ${job.price.toFixed(2)}` : ""}
        </span>
      </div>
      {(children.get(job.id) ?? []).map((c) => render(c, depth + 1))}
    </div>
  );

  return (
    <Panel title="Hiring graph" pattern="controlled" className="h-72">
      {top.length === 0 ? (
        <div className="py-4 text-center text-xs text-neutral-600">no hires yet</div>
      ) : (
        top.map((j) => render(j, 0))
      )}
    </Panel>
  );
}
