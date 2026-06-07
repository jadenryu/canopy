"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";

import { AgentRow, JobRow } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

const DONE_KEEP = 8; // completed cards kept in the third column

type Stage = "auction" | "working" | "done";

function stageOf(j: JobRow): Stage | null {
  if (j.status === "open") return "auction";
  if (["awarded", "executing", "verifying"].includes(j.status)) return "working";
  if (["settled", "rejected", "failed"].includes(j.status)) return "done";
  return null;
}

const STAGE_META: Record<Stage, { title: string; hint: string }> = {
  auction: { title: "Open auction", hint: "agents are bidding" },
  working: { title: "In progress", hint: "winner is executing" },
  done: { title: "Completed", hint: "scored and settled" },
};

// One job, one card. The card carries everything worth knowing at its
// stage — the auction stage shows the live ranked bid book, no edges.
function JobCard({
  job,
  agents,
  onSelectJob,
  onSelectAgent,
}: {
  job: JobRow;
  agents: Map<string, AgentRow>;
  onSelectJob: (id: string) => void;
  onSelectAgent: (id: string) => void;
}) {
  const stage = stageOf(job);
  const winner = job.winner_id ? agents.get(job.winner_id) : undefined;
  const bids = useMemo(
    () => [...job.bids].sort((a, b) => a.effective_bid - b.effective_bid),
    [job.bids]
  );
  const outcome =
    job.status === "settled"
      ? { text: `paid ${job.price.toFixed(2)}`, cls: "text-positive" }
      : job.status === "rejected"
        ? { text: "rejected before payment", cls: "text-negative" }
        : job.status === "failed"
          ? { text: "failed verification", cls: "text-negative" }
          : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ layout: { type: "spring", stiffness: 320, damping: 30 } }}
      onClick={() => onSelectJob(job.id)}
      className={`cursor-pointer rounded-md border bg-surface-2/70 p-2.5 transition-colors hover:border-edge-2 ${
        job.status === "rejected" || job.status === "failed"
          ? "border-negative/40"
          : job.status === "settled"
            ? "border-positive/30"
            : "border-edge"
      }`}
    >
      {/* the work itself, first */}
      <p className="line-clamp-2 text-xs leading-4 text-ink" title={job.spec}>
        {job.spec}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[10px] text-ink-faint">
        <span>{job.category}</span>
        {job.hops >= 3 && <span>· 3-hop</span>}
        {job.parent_job_id && <span>· subcontract</span>}
        <span className="num ml-auto">
          {job.price ? job.price.toFixed(2) : `cap ${job.bounty_cap.toFixed(0)}`}
        </span>
      </div>

      {/* stage-specific detail */}
      {stage === "auction" && (
        <div className="mt-2 flex flex-col gap-1 border-t border-edge/60 pt-1.5">
          {bids.length === 0 ? (
            <span className="text-[10px] text-ink-faint">
              waiting for bids…
            </span>
          ) : (
            bids.slice(0, 3).map((b, i) => {
              const bidder = agents.get(b.agent_id);
              return (
                <button
                  key={b.agent_id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAgent(b.agent_id);
                  }}
                  className={`flex items-baseline gap-1.5 text-left text-[10px] ${
                    i === 0 ? "text-ink" : "text-ink-faint"
                  } hover:text-canopy`}
                >
                  <span className="num w-3">{i + 1}</span>
                  <span className="truncate">{bidder?.label ?? b.agent_id}</span>
                  <span className="num ml-auto">{b.effective_bid.toFixed(2)}</span>
                  {i === 0 && <span className="text-canopy">leading</span>}
                </button>
              );
            })
          )}
          {bids.length > 3 && (
            <span className="text-[10px] text-ink-faint">
              +{bids.length - 3} more bids
            </span>
          )}
        </div>
      )}

      {stage === "working" && winner && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-edge/60 pt-1.5 text-[10px]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              job.status === "verifying" ? "bg-verify" : "bg-working animate-pulse-dot"
            }`}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelectAgent(winner.id);
            }}
            className="truncate text-ink hover:text-canopy"
          >
            {winner.label}
          </button>
          <span className="ml-auto text-ink-faint">
            {job.status === "verifying" ? "being scored" : "executing"}
          </span>
        </div>
      )}

      {stage === "done" && outcome && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-edge/60 pt-1.5 text-[10px]">
          <span className={outcome.cls}>{outcome.text}</span>
          {job.trace_url && (
            <a
              href={job.trace_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-ink-faint hover:text-canopy"
              title="execution trace in Weave"
            >
              trace ↗
            </a>
          )}
          {winner && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectAgent(winner.id);
              }}
              className="ml-auto truncate text-ink-faint hover:text-canopy"
            >
              {winner.label}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// The market as a pipeline: jobs migrate Open auction → In progress →
// Completed. The auction is a ranked bid book inside the card — no
// crossing edges, no overlap, nothing to untangle.
export function MarketPipeline({
  agents,
  jobs,
  onSelectAgent,
  onSelectJob,
}: {
  agents: AgentRow[];
  jobs: JobRow[];
  onSelectAgent: (id: string) => void;
  onSelectJob: (id: string) => void;
}) {
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const columns = useMemo(() => {
    const cols: Record<Stage, JobRow[]> = { auction: [], working: [], done: [] };
    for (const j of jobs) {
      const s = stageOf(j);
      if (s) cols[s].push(j);
    }
    cols.auction.reverse(); // newest auction on top
    cols.working.reverse();
    cols.done = cols.done.slice(-DONE_KEEP).reverse(); // recent history only
    return cols;
  }, [jobs]);

  return (
    <Panel
      title="Market pipeline"
      subtitle="every job moves left to right · click anything for detail"
      pattern="controlled"
      accent
      className="h-[26rem]"
    >
      {jobs.length === 0 ? (
        <Empty hint="Run a scenario to open the market.">No market activity</Empty>
      ) : (
        <div className="grid h-full grid-cols-3 gap-3">
          {(Object.keys(STAGE_META) as Stage[]).map((stage) => (
            <div key={stage} className="flex min-h-0 flex-col">
              <div className="mb-2 flex items-baseline justify-between px-0.5">
                <span className="text-[11px] font-medium text-ink-dim">
                  {STAGE_META[stage].title}
                </span>
                <span className="num text-[10px] text-ink-faint">
                  {columns[stage].length}
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-md border border-edge/60 bg-surface-2/20 p-2">
                <AnimatePresence mode="popLayout">
                  {columns[stage].length === 0 ? (
                    <motion.span
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="py-4 text-center text-[10px] text-ink-faint"
                    >
                      {STAGE_META[stage].hint}
                    </motion.span>
                  ) : (
                    columns[stage].map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        agents={agentMap}
                        onSelectJob={onSelectJob}
                        onSelectAgent={onSelectAgent}
                      />
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
