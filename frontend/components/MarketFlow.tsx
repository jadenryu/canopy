"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AgentRow, JobRow } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

// ----- layout constants (everything is computed, nothing measured per-node) ---

const CARD_W = 224; // job card width
const CARD_H = 56; // job card pitch in the intake column
const LANE_H = 38; // agent lane pitch
const LANE_X = CARD_W + 96; // where agent lanes begin (line corridor between)
const DONE_KEEP = 5; // finished cards kept visible (fading) per board

const STATUS_DOT: Record<string, string> = {
  open: "bg-info",
  awarded: "bg-working",
  executing: "bg-working",
  verifying: "bg-verify",
  settled: "bg-positive",
  rejected: "bg-negative",
  failed: "bg-negative",
};

// The market as a dispatch board — the process-flow view of the economy.
// Jobs enter on the left, auction lines fan out to bidding agents, the
// winning lane pulls the card across, settlement flashes the outcome.
// Position is meaningful everywhere: x = lifecycle stage, y = reputation
// rank (lanes physically reshuffle as trust moves).
export function MarketFlow({
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
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // lanes: active agents by reputation (rank = vertical position),
  // bankrupt/retired sink to the bottom
  const lanes = useMemo(() => {
    const active = agents.filter((a) => a.status === "active");
    const out = agents.filter((a) => a.status !== "active");
    active.sort((a, b) => b.reputation - a.reputation);
    return [...active, ...out];
  }, [agents]);
  const laneIndex = useMemo(
    () => new Map(lanes.map((a, i) => [a.id, i])),
    [lanes]
  );
  const laneY = (id: string) => (laneIndex.get(id) ?? 0) * LANE_H;

  // board jobs: everything in flight + a short fading tail of outcomes
  const board = useMemo(() => {
    const inflight = jobs.filter((j) =>
      ["open", "awarded", "executing", "verifying"].includes(j.status)
    );
    const done = jobs
      .filter((j) => ["settled", "rejected", "failed"].includes(j.status))
      .slice(-DONE_KEEP);
    return [...inflight, ...done];
  }, [jobs]);

  // intake stack order: open jobs newest-first
  const intake = board.filter((j) => j.status === "open");
  const intakeIndex = new Map(intake.map((j, i) => [j.id, i]));

  // a job card's position on the board
  const cardPos = (j: JobRow) => {
    if (j.status === "open") {
      return { left: 0, top: (intakeIndex.get(j.id) ?? 0) * (CARD_H + 8) };
    }
    // assigned or finished: docked beside the winner's lane
    const y = j.winner_id ? laneY(j.winner_id) : 0;
    return { left: LANE_X - CARD_W - 28, top: y + (LANE_H - CARD_H + 8) / 2 };
  };

  const boardH = Math.max(lanes.length * LANE_H, intake.length * (CARD_H + 8), 240);

  return (
    <Panel
      title="Market flow"
      subtitle="jobs route through auction to agents · lane order = reputation rank"
      pattern="controlled"
      accent
      className="h-[26rem]"
      footer={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>intake → auction → execution → settlement</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-px w-4 border-t border-dashed border-ink-faint" />
            bid
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-canopy" /> awarded
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" /> settled
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-negative" /> rejected
          </span>
        </div>
      }
    >
      {agents.length === 0 ? (
        <Empty hint="Run a scenario to open the market.">No market activity</Empty>
      ) : (
        <div ref={box} className="relative h-full w-full overflow-y-auto overflow-x-hidden">
          <div className="relative" style={{ height: boardH }}>
            {/* column headings */}
            <div className="pointer-events-none absolute -top-1 left-0 text-[10px] uppercase tracking-wide text-ink-faint">
              Intake
            </div>
            <div
              className="pointer-events-none absolute -top-1 text-[10px] uppercase tracking-wide text-ink-faint"
              style={{ left: LANE_X }}
            >
              Agents
            </div>

            {/* auction + award lines */}
            <svg
              className="pointer-events-none absolute inset-0"
              width={width}
              height={boardH}
            >
              {board.map((j) => {
                const from = cardPos(j);
                const x0 = from.left + CARD_W;
                const y0 = from.top + CARD_H / 2 + 6;
                const x1 = LANE_X - 4;
                const curve = (y1: number, key: string, cls: string, dash?: string, w = 1) => (
                  <path
                    key={key}
                    d={`M ${x0} ${y0} C ${x0 + 60} ${y0}, ${x1 - 60} ${y1}, ${x1} ${y1}`}
                    fill="none"
                    className={cls}
                    strokeWidth={w}
                    strokeDasharray={dash}
                  />
                );
                if (j.status === "open") {
                  // auction in progress: a line per bidder
                  return j.bids.map((b) =>
                    laneIndex.has(b.agent_id)
                      ? curve(
                          laneY(b.agent_id) + LANE_H / 2,
                          `${j.id}-${b.agent_id}`,
                          "stroke-(--color-ink-faint) opacity-50",
                          "3 3"
                        )
                      : null
                  );
                }
                if (
                  j.winner_id &&
                  ["awarded", "executing", "verifying"].includes(j.status)
                ) {
                  return curve(
                    laneY(j.winner_id) + LANE_H / 2,
                    `${j.id}-win`,
                    "stroke-(--color-canopy) opacity-80",
                    j.status === "executing" ? "6 4" : undefined,
                    1.5
                  );
                }
                return null;
              })}
            </svg>

            {/* job cards */}
            {board.map((j) => {
              const pos = cardPos(j);
              const finished = ["settled", "rejected", "failed"].includes(j.status);
              return (
                <button
                  key={j.id}
                  onClick={() => onSelectJob(j.id)}
                  className={`absolute rounded-md border bg-surface-2 px-2.5 py-1.5 text-left transition-all duration-700 ${
                    finished
                      ? j.status === "settled"
                        ? "border-positive/50 opacity-60"
                        : "border-negative/50 opacity-60"
                      : "border-edge hover:border-edge-2"
                  }`}
                  style={{ left: pos.left, top: pos.top + 12, width: CARD_W }}
                >
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        STATUS_DOT[j.status] ?? "bg-edge-2"
                      } ${j.status === "executing" ? "animate-pulse-dot" : ""}`}
                    />
                    <span className="num text-ink">{j.id}</span>
                    <span className="ml-auto text-[10px] text-ink-faint">
                      {j.status}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1.5 text-[10px] text-ink-faint">
                    <span>{j.category}</span>
                    {j.hops >= 3 && <span>· 3-hop</span>}
                    {j.client_id !== "human" && <span>· for {j.client_id}</span>}
                    <span className="num ml-auto text-ink-dim">
                      {j.price ? j.price.toFixed(2) : `≤ ${j.bounty_cap.toFixed(0)}`}
                    </span>
                  </div>
                </button>
              );
            })}

            {/* agent lanes */}
            {lanes.map((a) => {
              const out = a.status !== "active";
              const busy = jobs.some(
                (j) => j.status === "executing" && j.winner_id === a.id
              );
              return (
                <button
                  key={a.id}
                  onClick={() => onSelectAgent(a.id)}
                  className={`absolute flex items-center gap-2 rounded-md border px-2.5 text-left transition-all duration-500 ${
                    out
                      ? "border-edge/50 opacity-40"
                      : busy
                        ? "border-canopy/50 bg-surface-2"
                        : "border-edge bg-surface-2/60 hover:border-edge-2"
                  }`}
                  style={{
                    left: LANE_X,
                    top: laneY(a.id) + 12,
                    width: Math.max(220, width - LANE_X),
                    height: LANE_H - 6,
                  }}
                >
                  {/* role glyph */}
                  <svg width="10" height="10" className="shrink-0">
                    {a.strategy === "manager" ? (
                      <rect
                        x="1.5"
                        y="1.5"
                        width="7"
                        height="7"
                        transform="rotate(45 5 5)"
                        fill="none"
                        stroke="var(--color-ink-dim)"
                      />
                    ) : (
                      <circle cx="5" cy="5" r="4" fill="none" stroke="var(--color-ink-dim)" />
                    )}
                  </svg>
                  <span className="w-32 truncate text-xs text-ink">{a.id}</span>
                  <span className="hidden w-20 truncate text-[10px] text-ink-faint md:inline">
                    {a.strategy}
                  </span>
                  <div className="h-1 max-w-28 flex-1 overflow-hidden rounded-full bg-edge">
                    <div
                      className="h-full rounded-full bg-canopy/70 transition-all duration-500"
                      style={{ width: `${Math.min(100, a.reputation * 100)}%` }}
                    />
                  </div>
                  <span className="num w-12 text-right text-[11px] text-ink-dim">
                    {a.balance.toFixed(0)}
                  </span>
                  {busy && (
                    <span className="text-[10px] text-canopy">working</span>
                  )}
                  {(a.frauds ?? 0) > 0 && !out && (
                    <span className="rounded border border-negative/40 px-1 text-[9px] text-negative">
                      audit
                    </span>
                  )}
                  {out && (
                    <span className="text-[10px] text-negative">{a.status}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}
