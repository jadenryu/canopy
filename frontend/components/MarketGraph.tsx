"use client";

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type ForceCenter,
  type ForceCollide,
  type ForceLink,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useMemo, useRef, useState } from "react";

import { AgentRow, JobRow } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

// ----- graph datatypes --------------------------------------------------------

type GNode = SimulationNodeDatum & {
  id: string;
  kind: "human" | "agent";
  agent?: AgentRow;
};

type GLink = SimulationLinkDatum<GNode> & {
  key: string; // client→winner pair
  jobs: JobRow[]; // every job on this edge, newest last
};

const EDGE_COLOR: Record<string, string> = {
  settled: "var(--color-positive)",
  rejected: "var(--color-negative)",
  failed: "var(--color-negative)",
  executing: "var(--color-working)",
  awarded: "var(--color-working)",
  verifying: "var(--color-verify)",
};

function nodeRadius(a?: AgentRow): number {
  if (!a) return 14; // the human hub
  return 8 + Math.sqrt(Math.max(0, a.balance)) * 0.9; // wealth = mass
}

function nodeColor(a?: AgentRow): string {
  if (!a) return "var(--color-info)";
  if (a.status === "bankrupt") return "var(--color-negative)";
  if (a.strategy === "manager") return "var(--color-special)";
  return "var(--color-canopy)";
}

// ----- the hero ---------------------------------------------------------------

// The market as a living network: agents orbit the human client, sized by
// wallet, ringed by reputation; every hire draws an edge (subcontracts
// branch agent→agent). Click anything to inspect it. This is the same
// AG-UI state the widgets render — just drawn as an economy.
export function MarketGraph({
  agents,
  jobs,
  executing,
  onSelectAgent,
  onSelectJob,
}: {
  agents: AgentRow[];
  jobs: JobRow[];
  executing: Set<string>;
  onSelectAgent: (id: string) => void;
  onSelectJob: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 420 });
  const [, bump] = useState(0); // re-render per simulation tick

  // persistent node/link identity across state updates (the sim mutates
  // x/y in place; we must not recreate nodes every snapshot)
  const nodesRef = useRef<Map<string, GNode>>(new Map());
  const simRef = useRef<ReturnType<typeof forceSimulation<GNode>> | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const links = useMemo(() => {
    const byPair = new Map<string, GLink>();
    for (const j of jobs) {
      if (!j.winner_id) continue;
      const key = `${j.client_id}→${j.winner_id}`;
      const link =
        byPair.get(key) ??
        ({ key, source: j.client_id, target: j.winner_id, jobs: [] } as GLink);
      link.jobs.push(j);
      byPair.set(key, link);
    }
    return [...byPair.values()];
  }, [jobs]);

  // ONE persistent simulation for the component's lifetime. State bursts
  // (dozens of deltas/sec mid-scenario) only update its data in place and
  // gently reheat — never recreate forces. Renders are rAF-gated so React
  // paints at most once per frame no matter how fast ticks or deltas arrive.
  useEffect(() => {
    let raf = 0;
    const sim = forceSimulation<GNode>([])
      .force("link", forceLink<GNode, GLink>([]).id((d) => d.id).distance(110).strength(0.25))
      .force("charge", forceManyBody().strength(-220))
      .force("center", forceCenter(0, 0).strength(0.06))
      .force("collide", forceCollide<GNode>().radius((d) => nodeRadius(d.agent) + 14))
      .alphaDecay(0.04)
      .on("tick", () => {
        if (raf) return; // coalesce ticks into one paint per frame
        raf = requestAnimationFrame(() => {
          raf = 0;
          bump((n) => n + 1);
        });
      })
      .stop();
    simRef.current = sim;
    return () => {
      cancelAnimationFrame(raf);
      sim.stop();
      simRef.current = null;
    };
  }, []);

  // keep node payloads (wallet size, reputation ring) fresh on EVERY delta.
  // Repaint goes through the sim's tick→rAF path: a whisper of alpha makes
  // the graph visibly breathe when money moves, and keeps renders frame-gated.
  useEffect(() => {
    const map = nodesRef.current;
    let dirty = false;
    for (const a of agents) {
      const n = map.get(a.id);
      if (n && n.agent !== a) {
        n.agent = a;
        dirty = true;
      }
    }
    const sim = simRef.current;
    if (dirty && sim) sim.alpha(Math.max(sim.alpha(), 0.05)).restart();
  }, [agents]);

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const map = nodesRef.current;
    const want = new Set<string>(["human", ...agents.map((a) => a.id)]);
    // upsert
    if (!map.has("human")) {
      map.set("human", { id: "human", kind: "human", x: size.w / 2, y: size.h / 2 });
    }
    for (const a of agents) {
      const existing = map.get(a.id);
      if (existing) {
        existing.agent = a;
      } else {
        map.set(a.id, {
          id: a.id,
          kind: "agent",
          agent: a,
          // newcomers (forks!) enter from the edge, not the void
          x: size.w / 2 + (Math.random() - 0.5) * size.w * 0.8,
          y: size.h / 2 + (Math.random() - 0.5) * size.h * 0.8,
        });
      }
    }
    for (const id of [...map.keys()]) if (!want.has(id)) map.delete(id);

    const nodes = [...map.values()];
    const simLinks = links
      .filter(
        (l) => map.has(l.source as string) && map.has(l.target as string)
      )
      .map((l) => ({ ...l }));

    // update the persistent sim in place + gentle reheat
    sim.nodes(nodes);
    (sim.force("link") as ForceLink<GNode, GLink>).links(simLinks);
    (sim.force("center") as ForceCenter<GNode>).x(size.w / 2).y(size.h / 2);
    (sim.force("collide") as ForceCollide<GNode>).radius(
      (d) => nodeRadius(d.agent) + 14
    );
    sim.alpha(0.5).restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents.map((a) => a.id).join(","), links.length, size.w, size.h]);

  /* eslint-disable react-hooks/refs -- d3-force mutates node x/y in place;
     reading the ref at render time is the whole point of the pattern, and
     re-renders are explicitly driven by the sim's rAF-gated tick handler. */
  const nodes = [...nodesRef.current.values()];
  const pos = (id: string) => nodesRef.current.get(id);

  return (
    <Panel
      title="The market"
      subtitle="agents sized by wallet · ringed by reputation · click to inspect"
      pattern="controlled"
      accent
      className="h-[26rem]"
    >
      {agents.length === 0 ? (
        <Empty glyph="❉" hint="run a scenario ▶ and the economy materializes">
          no market yet
        </Empty>
      ) : (
        <div ref={box} className="h-full w-full">
          <svg width={size.w} height={size.h} className="overflow-visible">
            {/* edges: who hires whom */}
            {links.map((l) => {
              const s = pos(typeof l.source === "string" ? l.source : (l.source as GNode).id);
              const t = pos(typeof l.target === "string" ? l.target : (l.target as GNode).id);
              if (!s || !t) return null;
              const latest = l.jobs[l.jobs.length - 1];
              const active = latest.status === "executing" || latest.status === "awarded";
              return (
                <g key={l.key} onClick={() => onSelectJob(latest.id)} className="cursor-pointer">
                  {/* fat invisible hit area */}
                  <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="transparent" strokeWidth={14} />
                  <line
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={EDGE_COLOR[latest.status] ?? "var(--color-edge-2)"}
                    strokeWidth={Math.min(1 + l.jobs.length * 0.8, 5)}
                    strokeOpacity={active ? 0.95 : 0.45}
                    strokeDasharray={active ? "6 4" : undefined}
                    className={active ? "animate-edge-flow" : ""}
                  />
                </g>
              );
            })}

            {/* nodes: the human hub + every agent */}
            {nodes.map((n) => {
              const r = nodeRadius(n.agent);
              const busy = n.kind === "agent" && executing.has(n.id);
              const bankrupt = n.agent?.status === "bankrupt";
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                  onClick={() => n.kind === "agent" && onSelectAgent(n.id)}
                  className={n.kind === "agent" ? "cursor-pointer" : ""}
                  opacity={bankrupt ? 0.45 : 1}
                >
                  {/* reputation ring */}
                  {n.agent && !bankrupt && (
                    <circle
                      r={r + 3.5}
                      fill="none"
                      stroke={nodeColor(n.agent)}
                      strokeOpacity={0.35 + n.agent.reputation * 0.55}
                      strokeWidth={1.5 + n.agent.reputation * 2.5}
                    />
                  )}
                  <circle
                    r={r}
                    fill="var(--color-surface-2)"
                    stroke={nodeColor(n.agent)}
                    strokeWidth={n.kind === "human" ? 2.5 : 1.5}
                    className={busy ? "animate-pulse-dot" : ""}
                  />
                  <text
                    textAnchor="middle"
                    dy={n.kind === "human" ? 4 : r + 13}
                    className="pointer-events-none select-none fill-(--color-ink-dim)"
                    fontSize={n.kind === "human" ? 12 : 10}
                  >
                    {n.kind === "human" ? "⌂" : n.id.replace("worker-", "")}
                  </text>
                  {bankrupt && (
                    <text textAnchor="middle" dy={4} fontSize={11} className="pointer-events-none select-none">
                      💀
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </Panel>
  );
}
