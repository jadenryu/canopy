"use client";

import { useEffect, useRef, useState } from "react";

import { ApprovalCard, ControlPanel } from "@/components/ControlPanel";
import { DeclarativePanel } from "@/components/DeclarativePanel";
import { EventFeed } from "@/components/EventFeed";
import { HiringGraph } from "@/components/HiringGraph";
import { Leaderboard } from "@/components/Leaderboard";
import { OrderBook } from "@/components/OrderBook";
import { PriceChart } from "@/components/PriceChart";
import { ReportFrame } from "@/components/ReportFrame";
import { Wallets } from "@/components/Wallets";
import { runScenario, useMarketState } from "@/lib/useMarketState";

// One stat in the ticker strip under the header.
function Tick({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-ink-faint">{label}</span>
      <span className={tone ?? "text-ink"}>{value}</span>
    </span>
  );
}

// The trading floor: a pure projection of backend state over ONE AG-UI
// connection, demonstrating all three gen-UI patterns (see panel badges).
export default function Home() {
  const { state, start, running } = useMarketState();
  const [launching, setLaunching] = useState(false);
  const watched = useRef(false);

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

  // ticker stats — all derived from state already on this page
  const agents = state?.agents ?? [];
  const jobs = state?.jobs ?? [];
  const settledJobs = jobs.filter((j) => j.status === "settled");
  const volume = settledJobs.reduce((s, j) => s + j.price, 0);
  const bankrupt = agents.filter((a) => a.status === "bankrupt").length;

  return (
    <main className="flex min-h-screen flex-col gap-3 bg-bg p-4 font-mono text-ink">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-bold uppercase tracking-tight">
            🌳 Canopy
          </h1>
          <span className="text-xs text-ink-faint">
            self-organizing agent labor market — live floor
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              {running && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-canopy opacity-60" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  running ? "bg-canopy" : "bg-edge-2"
                }`}
              />
            </span>
            <span
              className={`text-[10px] font-semibold tracking-widest ${
                running ? "text-canopy" : "text-ink-faint"
              }`}
            >
              {running ? "LIVE" : "IDLE"}
            </span>
          </span>
          <button
            onClick={() => start()}
            disabled={running}
            className="rounded-md border border-edge px-3 py-1 text-ink-dim transition-colors hover:border-edge-2 hover:text-ink disabled:opacity-40"
          >
            watch
          </button>
          <button
            onClick={() => launch(false)}
            disabled={launching}
            className="rounded-md bg-canopy px-3 py-1 font-semibold text-black transition-colors hover:bg-positive disabled:opacity-40"
          >
            {launching ? "launching…" : "▶ run scenario"}
          </button>
        </div>
      </header>

      {/* ticker strip — derived stats, terminal style */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-y border-edge px-1 py-1.5 text-[11px]">
        <Tick label="jobs settled" value={settledJobs.length} tone="text-positive" />
        <Tick label="volume" value={volume.toFixed(2)} tone="text-positive" />
        <Tick label="agents" value={agents.length - bankrupt} />
        <Tick
          label="bankrupt"
          value={bankrupt}
          tone={bankrupt > 0 ? "text-negative" : "text-ink"}
        />
        <Tick label="ledger" value={state?.ledger_entries ?? 0} />
        <Tick label="reserve" value={(state?.reserve_price ?? 0.5).toFixed(2)} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* hero row */}
        <div className="lg:col-span-2">
          <PriceChart prices={state?.prices ?? {}} />
        </div>
        <EventFeed events={state?.events ?? []} />

        {/* data rows */}
        <OrderBook jobs={state?.jobs ?? []} />
        <Leaderboard agents={state?.agents ?? []} />
        <Wallets agents={state?.agents ?? []} />
        <HiringGraph jobs={state?.jobs ?? []} />
        <DeclarativePanel spec={state?.job_detail ?? null} />
        <ReportFrame html={state?.report_html ?? null} />

        {/* human controls — full width strip */}
        <div className="lg:col-span-3">
          <ControlPanel pending={state?.pending_action ?? null} />
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-2 text-[10px] text-ink-faint">
        <span className="text-ink-faint">gen-UI spectrum, one AG-UI connection:</span>
        <span className="rounded-full border border-info/30 bg-info/10 px-2 py-0.5 text-info">
          controlled · fixed widgets
        </span>
        <span className="rounded-full border border-working/30 bg-working/10 px-2 py-0.5 text-working">
          declarative · streamed UI spec
        </span>
        <span className="rounded-full border border-special/30 bg-special/10 px-2 py-0.5 text-special">
          open-ended · sandboxed agent HTML
        </span>
        <span>· high-impact actions gated by AG-UI HITL approval</span>
      </footer>

      <ApprovalCard pending={state?.pending_action ?? null} />
    </main>
  );
}
