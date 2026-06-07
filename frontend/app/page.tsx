"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { BidLeaderboard } from "@/components/BidLeaderboard";
import { ApprovalCard, ControlPanel } from "@/components/ControlPanel";
import { DeclarativePanel } from "@/components/DeclarativePanel";
import { EventFeed } from "@/components/EventFeed";
import { FloorChat } from "@/components/FloorChat";
import { HiringGraph } from "@/components/HiringGraph";
import { AgentSheet, JobSheet } from "@/components/Inspector";
import { Leaderboard } from "@/components/Leaderboard";
import { MarketPipeline } from "@/components/MarketPipeline";
import { OrderBook } from "@/components/OrderBook";
import { PriceCards } from "@/components/PriceCards";
import { ReportFrame } from "@/components/ReportFrame";
import { Wallets } from "@/components/Wallets";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { runScenario, useMarketState } from "@/lib/useMarketState";

// big moments route attention to the tab where they're visible
const EVENT_TAB: Record<string, string> = {
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
// connection. The market flow board is the centerpiece; everything is
// selectable for detail.
export default function Home() {
  const { state } = useMarketState();
  const [agentId, setAgentId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [tab, setTab] = useState("floor");
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const seenEvents = useRef(0);
  // the AG-UI stream is started once by AppShell — pages only read state

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

  // memoized so the earnings useMemo below keeps a stable dependency
  const settledJobs = useMemo(
    () => jobs.filter((j) => j.status === "settled"),
    [jobs]
  );
  const volume = settledJobs.reduce((s, j) => s + j.price, 0);
  const active = agents.filter((a) => a.status === "active").length;
  const bankrupt = agents.filter((a) => a.status === "bankrupt").length;

  const [earningsOpen, setEarningsOpen] = useState(false);
  const earnings = useMemo(
    () =>
      [...agents]
        .map((a) => ({
          a,
          earned: settledJobs
            .filter((j) => j.winner_id === a.id)
            .reduce((s, j) => s + j.price, 0),
          won: settledJobs.filter((j) => j.winner_id === a.id).length,
        }))
        .filter((e) => e.won > 0)
        .sort((x, y) => y.earned - x.earned),
    [agents, settledJobs]
  );

  const selectAgent = (id: string) => {
    setJobId(null);
    setAgentId(id);
  };
  const selectJob = (id: string) => {
    setAgentId(null);
    setJobId(id);
  };

  const coldStart = agents.length === 0 && jobs.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Trading floor</h1>
        <p className="max-w-2xl text-xs text-ink-faint">
          A live labor market for AI agents: jobs are auctioned, winners
          execute, a Weave referee scores every deliverable, and payment +
          reputation follow the score. No central planner.
        </p>
      </div>

      {coldStart && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-edge bg-surface px-6 py-10 text-center">
          <p className="text-sm text-ink">The market is closed.</p>
          <p className="max-w-md text-xs text-ink-faint">
            Run a scenario to register the agent fleet and stream 13 jobs
            through the full lifecycle — auctions, subcontracts, audits,
            settlements — all live on this page.
          </p>
          <button
            onClick={() => runScenario({ jobs: 13, mock: false })}
            className="rounded-md bg-canopy px-4 py-2 text-xs font-medium text-[#06241a] transition-opacity hover:opacity-90"
          >
            Run scenario
          </button>
        </div>
      )}

      {/* KPI strip */}
      <div className="flex flex-wrap items-center divide-x divide-edge">
        <Kpi label="Jobs settled" value={settledJobs.length} />
        <button onClick={() => setEarningsOpen(true)} className="text-left">
          <Kpi label="Volume — click to break down" value={volume.toFixed(2)} tone="text-canopy" />
        </button>
        <Kpi label="Active agents" value={active} />
        <Kpi
          label="Bankruptcies"
          value={bankrupt}
          tone={bankrupt > 0 ? "text-negative" : undefined}
        />
        <Kpi label="Ledger entries" value={state?.ledger_entries ?? 0} />
        <Kpi label="Reserve price" value={(state?.reserve_price ?? 0.5).toFixed(2)} />
      </div>

      {/* centerpiece — the flow board + the live activity stream */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MarketPipeline
            agents={agents}
            jobs={jobs}
            onSelectAgent={selectAgent}
            onSelectJob={selectJob}
          />
        </div>
        <EventFeed events={events} onSelectJob={selectJob} onSelectAgent={selectAgent} />
      </div>

      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList className="border border-edge bg-surface">
          <TabsTrigger value="floor" className="gap-1.5 text-xs">
            Market data
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
        </TabsList>
        <TabsContent value="floor" className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PriceCards prices={state?.prices ?? {}} />
          <BidLeaderboard agents={agents} jobs={jobs} onSelectAgent={selectAgent} />
          <Leaderboard agents={agents} onSelectAgent={selectAgent} />
          <Wallets agents={agents} />
          <FloorChat messages={state?.chat ?? []} onSelectAgent={selectAgent} />
          <div className="lg:col-span-2">
            <OrderBook jobs={jobs} />
          </div>
        </TabsContent>
        <TabsContent value="deals" className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <HiringGraph jobs={jobs} agents={agents} />
          <DeclarativePanel spec={state?.job_detail ?? null} />
          <ReportFrame html={state?.report_html ?? null} />
        </TabsContent>
      </Tabs>

      <ControlPanel pending={state?.pending_action ?? null} />

      <Sheet open={earningsOpen} onOpenChange={setEarningsOpen}>
        <SheetContent className="w-96 overflow-y-auto border-edge bg-surface sm:max-w-96">
          <SheetHeader>
            <SheetTitle className="text-ink">Volume by agent</SheetTitle>
            <SheetDescription className="text-xs text-ink-dim">
              Total settled payments earned this session — escrow released on
              passing the Weave referee.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            {earnings.length === 0 ? (
              <p className="py-4 text-center text-xs text-ink-faint">
                No settled payments yet.
              </p>
            ) : (
              earnings.map(({ a, earned, won }) => (
                <button
                  key={a.id}
                  onClick={() => {
                    setEarningsOpen(false);
                    selectAgent(a.id);
                  }}
                  className="flex items-center gap-2 rounded-md border border-edge px-2.5 py-2 text-left text-xs transition-colors hover:border-edge-2 hover:bg-surface-2/60"
                >
                  <span className="min-w-0 flex-1 truncate text-ink">{a.label || a.id}</span>
                  <span className="num text-[11px] text-ink-faint">{won} jobs</span>
                  <span className="num w-16 text-right text-positive">
                    {earned.toFixed(2)}
                  </span>
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

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
    </div>
  );
}
