"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Arena } from "@/components/Arena";
import { ApprovalCard, ControlPanel } from "@/components/ControlPanel";
import { DeclarativePanel } from "@/components/DeclarativePanel";
import { EventFeed } from "@/components/EventFeed";
import { HiringGraph } from "@/components/HiringGraph";
import { AgentSheet, JobSheet } from "@/components/Inspector";
import { Leaderboard } from "@/components/Leaderboard";
import { MarketFlow } from "@/components/MarketFlow";
import { OrderBook } from "@/components/OrderBook";
import { PriceChart } from "@/components/PriceChart";
import { ReportFrame } from "@/components/ReportFrame";
import { Wallets } from "@/components/Wallets";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { runScenario, useMarketState } from "@/lib/useMarketState";

// big moments route attention to the tab where they're visible
const EVENT_TAB: Record<string, string> = {
  shock: "floor",
  bankruptcy: "floor",
  fork: "floor",
  fraud_detected: "floor",
  report_ready: "deals",
  scenario_finished: "deals",
};

// One headline statistic in the KPI strip.
function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-5 first:pl-1">
      <span className="text-[11px] text-ink-faint">{label}</span>
      <span className={`num text-xl font-medium ${tone ?? "text-ink"}`}>{value}</span>
    </div>
  );
}

// The trading floor: a pure projection of backend state over one AG-UI
// connection. The market network is the centerpiece; everything is
// selectable; the three gen-UI patterns are tagged on their panels.
export default function Home() {
  const { state, start, running } = useMarketState();
  const [launching, setLaunching] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [tab, setTab] = useState("floor");
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const watched = useRef(false);
  const seenEvents = useRef(0);

  // open the live watch stream once on mount
  useEffect(() => {
    if (!watched.current) {
      watched.current = true;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const launch = async (mock: boolean) => {
    setLaunching(true);
    try {
      if (!running) start(); // make sure the watch stream is live
      await runScenario({ jobs: 13, mock });
    } finally {
      setTimeout(() => setLaunching(false), 1500);
    }
  };

  const stateAgents = state?.agents;
  const stateJobs = state?.jobs;
  const stateEvents = state?.events;
  const agents = useMemo(() => stateAgents ?? [], [stateAgents]);
  const jobs = useMemo(() => stateJobs ?? [], [stateJobs]);
  const events = useMemo(() => stateEvents ?? [], [stateEvents]);

  // mark a hidden tab when a significant event lands there
  useEffect(() => {
    const fresh = events.slice(seenEvents.current);
    seenEvents.current = events.length;
    const targets = fresh
      .map((e) => EVENT_TAB[e.type])
      .filter((t): t is string => !!t && t !== tab);
    if (targets.length) setFlash((prev) => new Set([...prev, ...targets]));
  }, [events, tab]);

  const switchTab = (v: string) => {
    setTab(v);
    setFlash((prev) => {
      const next = new Set(prev);
      next.delete(v);
      return next;
    });
  };

  const settledJobs = jobs.filter((j) => j.status === "settled");
  const volume = settledJobs.reduce((s, j) => s + j.price, 0);
  const bankrupt = agents.filter((a) => a.status === "bankrupt").length;

  const selectAgent = (id: string) => {
    setJobId(null);
    setAgentId(id);
  };
  const selectJob = (id: string) => {
    setAgentId(null);
    setJobId(id);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col gap-4 bg-bg px-6 py-4 text-ink">
      {/* top navigation */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight">Canopy</h1>
          <span className="hidden text-xs text-ink-faint sm:inline">
            Self-organizing labor market for AI agents
          </span>
        </div>
        <div className="flex items-center gap-2.5 text-xs">
          <span className="mr-1 flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              {running && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-canopy opacity-50" />
              )}
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                  running ? "bg-canopy" : "bg-edge-2"
                }`}
              />
            </span>
            <span className={running ? "text-ink-dim" : "text-ink-faint"}>
              {running ? "Live" : "Idle"}
            </span>
          </span>
          <Link
            href="/benchmarks"
            className="rounded-md px-2.5 py-1.5 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Benchmarks
          </Link>
          <button
            onClick={() => start()}
            disabled={running}
            className="rounded-md border border-edge px-3 py-1.5 text-ink-dim transition-colors hover:border-edge-2 hover:text-ink disabled:opacity-40"
          >
            Reconnect
          </button>
          <button
            onClick={() => launch(false)}
            disabled={launching}
            className="rounded-md bg-canopy px-3.5 py-1.5 font-medium text-[#06241a] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {launching ? "Starting…" : "Run scenario"}
          </button>
        </div>
      </header>

      {/* KPI strip */}
      <div className="flex flex-wrap items-center divide-x divide-edge">
        <Kpi label="Jobs settled" value={settledJobs.length} />
        <Kpi label="Volume" value={volume.toFixed(2)} tone="text-canopy" />
        <Kpi label="Active agents" value={agents.length - bankrupt} />
        <Kpi
          label="Bankruptcies"
          value={bankrupt}
          tone={bankrupt > 0 ? "text-negative" : undefined}
        />
        <Kpi label="Ledger entries" value={state?.ledger_entries ?? 0} />
        <Kpi label="Reserve price" value={(state?.reserve_price ?? 0.5).toFixed(2)} />
      </div>

      {/* centerpiece — the network + the live activity stream */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MarketFlow
            agents={agents}
            jobs={jobs}
            onSelectAgent={selectAgent}
            onSelectJob={selectJob}
          />
        </div>
        <EventFeed events={events} />
      </div>

      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList className="border border-edge bg-surface">
          <TabsTrigger value="floor" className="gap-1.5 text-xs">
            Trading floor
            {flash.has("floor") && (
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-working" />
            )}
          </TabsTrigger>
          <TabsTrigger value="deals" className="gap-1.5 text-xs">
            Deals & reports
            {flash.has("deals") && (
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-working" />
            )}
          </TabsTrigger>
          <TabsTrigger value="arena" className="text-xs">
            Arena
          </TabsTrigger>
        </TabsList>
        <TabsContent value="floor" className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PriceChart prices={state?.prices ?? {}} />
          <OrderBook jobs={jobs} />
          <Leaderboard agents={agents} />
          <Wallets agents={agents} />
        </TabsContent>
        <TabsContent value="deals" className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <HiringGraph jobs={jobs} />
          <DeclarativePanel spec={state?.job_detail ?? null} />
          <ReportFrame html={state?.report_html ?? null} />
        </TabsContent>
        <TabsContent value="arena" className="mt-3">
          <Arena agents={agents} />
        </TabsContent>
      </Tabs>

      <ControlPanel pending={state?.pending_action ?? null} />

      <footer className="border-t border-edge pt-3 text-[11px] leading-5 text-ink-faint">
        Generative UI over one AG-UI connection — controlled (fixed widgets),
        declarative (streamed UI specification), open-ended (sandboxed
        agent-authored report). High-impact actions require human approval
        routed through shared state.
      </footer>

      <ApprovalCard pending={state?.pending_action ?? null} />
      <AgentSheet
        agent={agents.find((a) => a.id === agentId) ?? null}
        jobs={jobs}
        open={agentId !== null}
        onClose={() => setAgentId(null)}
        onSelectJob={selectJob}
      />
      <JobSheet
        job={jobs.find((j) => j.id === jobId) ?? null}
        open={jobId !== null}
        onClose={() => setJobId(null)}
        onSelectAgent={selectAgent}
      />
    </main>
  );
}
