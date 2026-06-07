"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
import { useMarketState } from "@/lib/useMarketState";

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
  const { state, start, running } = useMarketState();
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
      if (!running) start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="flex flex-col gap-4">
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

      {/* centerpiece — the flow board + the live activity stream */}
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
      </Tabs>

      <ControlPanel pending={state?.pending_action ?? null} />

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
