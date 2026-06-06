"use client";

import { STATUS } from "@/lib/status";
import { AgentRow, JobRow } from "@/lib/useMarketState";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// Click-to-inspect drawers for the market graph: an agent "profile page"
// (the LinkedIn view of a worker) and a job dossier with its bid history.

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-edge bg-surface-2/60 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={`text-sm tabular-nums ${tone ?? "text-ink"}`}>{value}</div>
    </div>
  );
}

export function AgentSheet({
  agent,
  jobs,
  open,
  onClose,
  onSelectJob,
}: {
  agent: AgentRow | null;
  jobs: JobRow[];
  open: boolean;
  onClose: () => void;
  onSelectJob: (id: string) => void;
}) {
  if (!agent) return null;
  const worked = jobs.filter((j) => j.winner_id === agent.id).reverse();
  const hired = jobs.filter((j) => j.client_id === agent.id).reverse();
  const bankrupt = agent.status === "bankrupt";
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-96 overflow-y-auto border-edge bg-surface font-mono sm:max-w-96">
        <SheetHeader className="pb-0">
          <SheetTitle className="flex items-center gap-2 font-mono text-ink">
            {bankrupt ? "💀" : "●"} {agent.id}
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] ${
                bankrupt
                  ? "border-negative/40 text-negative"
                  : "border-canopy/40 text-canopy"
              }`}
            >
              {agent.status}
            </span>
          </SheetTitle>
          <SheetDescription className="font-mono text-xs text-ink-dim">
            {agent.strategy} strategy · {agent.model_tier} tier
            {agent.parent_id ? ` · forked from ${agent.parent_id}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-2 px-4">
          <Stat
            label="balance"
            value={agent.balance.toFixed(2)}
            tone={bankrupt ? "text-negative" : "text-positive"}
          />
          <Stat label="reputation" value={agent.reputation.toFixed(3)} />
          <Stat label="jobs won" value={String(agent.jobs_won)} />
          <Stat
            label="jobs failed"
            value={String(agent.jobs_failed)}
            tone={agent.jobs_failed > 0 ? "text-negative" : undefined}
          />
          {(agent.frauds ?? 0) > 0 && (
            <Stat
              label="🚨 audit strikes"
              value={String(agent.frauds)}
              tone="text-negative"
            />
          )}
        </div>

        {/* self-improvement loop: Weave score + rationale → behavior change */}
        {(agent.lessons?.length ?? 0) > 0 && (
          <div className="px-4 pb-2">
            <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-faint">
              weave feedback → lessons learned
            </div>
            <div className="flex flex-col gap-1">
              {[...(agent.lessons ?? [])].reverse().map((l) => (
                <div
                  key={`${l.job_id}-${l.ts}`}
                  className="flex items-baseline gap-2 rounded-md border border-canopy/25 bg-canopy/5 px-2 py-1.5 text-[11px]"
                >
                  <span
                    className={`shrink-0 rounded px-1 py-px text-[10px] tabular-nums ${
                      l.score >= 0.7
                        ? "bg-positive/15 text-positive"
                        : "bg-negative/15 text-negative"
                    }`}
                  >
                    {l.score.toFixed(2)}
                  </span>
                  <span className="leading-4 text-ink">{l.lesson}</span>
                  <span className="ml-auto shrink-0 text-[9px] text-ink-faint">
                    {l.job_id}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {[
          { title: "work history", list: worked },
          { title: "hired subcontractors on", list: hired },
        ].map(
          ({ title, list }) =>
            list.length > 0 && (
              <div key={title} className="px-4 pb-2">
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-faint">
                  {title}
                </div>
                <div className="flex flex-col gap-1">
                  {list.slice(0, 10).map((j) => (
                    <button
                      key={j.id}
                      onClick={() => onSelectJob(j.id)}
                      className="flex items-center gap-2 rounded-md border border-edge px-2 py-1.5 text-left text-[11px] transition-colors hover:border-edge-2 hover:bg-surface-2/60"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS[j.status]?.dot ?? "bg-edge-2"}`} />
                      <span className="text-ink-dim">{j.id}</span>
                      <span className="truncate text-ink-faint">{j.category}</span>
                      <span className="ml-auto tabular-nums">
                        {j.price ? j.price.toFixed(2) : "—"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
        )}
      </SheetContent>
    </Sheet>
  );
}

export function JobSheet({
  job,
  open,
  onClose,
  onSelectAgent,
}: {
  job: JobRow | null;
  open: boolean;
  onClose: () => void;
  onSelectAgent: (id: string) => void;
}) {
  if (!job) return null;
  const s = STATUS[job.status];
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-96 overflow-y-auto border-edge bg-surface font-mono sm:max-w-96">
        <SheetHeader className="pb-0">
          <SheetTitle className="flex items-center gap-2 font-mono text-ink">
            {job.id}
            <span className={`flex items-center gap-1.5 text-[11px] ${s?.text ?? ""}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${s?.dot ?? "bg-edge-2"}`} />
              {job.status}
            </span>
          </SheetTitle>
          <SheetDescription className="font-mono text-xs text-ink-dim">
            {job.spec}
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-2 px-4">
          <Stat label="category" value={`${job.category}${job.hops >= 3 ? " ★3-hop" : ""}`} />
          <Stat label="client" value={job.client_id} />
          <Stat label="winner" value={job.winner_id ?? "—"} />
          <Stat label="price" value={job.price ? job.price.toFixed(2) : "—"} tone="text-positive" />
        </div>

        {job.bids.length > 0 && (
          <div className="px-4 pb-4">
            <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-faint">
              bid book (effective = price ÷ rep weight, lowest wins)
            </div>
            <div className="flex flex-col gap-1">
              {[...job.bids]
                .sort((a, b) => a.effective_bid - b.effective_bid)
                .map((b, i) => (
                  <button
                    key={b.agent_id}
                    onClick={() => onSelectAgent(b.agent_id)}
                    className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors hover:border-edge-2 ${
                      b.agent_id === job.winner_id
                        ? "border-positive/40 bg-positive/10 text-positive"
                        : "border-edge text-ink-dim hover:bg-surface-2/60"
                    }`}
                  >
                    <span className="w-4 text-ink-faint">{i + 1}</span>
                    <span>{b.agent_id}</span>
                    {b.agent_id === job.winner_id && <span>🏆</span>}
                    <span className="ml-auto tabular-nums">{b.effective_bid.toFixed(2)}</span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
