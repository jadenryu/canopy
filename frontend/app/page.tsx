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

  return (
    <main className="flex min-h-screen flex-col gap-3 bg-black p-4 font-mono text-neutral-200">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold tracking-tight">🌳 Canopy</h1>
          <span className="text-xs text-neutral-500">
            self-organizing agent labor market — live floor
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              running ? "bg-green-500" : "bg-neutral-600"
            }`}
          />
          <span className="text-neutral-500">
            {running ? "live" : "stream idle"}
          </span>
          <button
            onClick={() => start()}
            disabled={running}
            className="rounded border border-neutral-700 px-3 py-1 hover:bg-neutral-900 disabled:opacity-40"
          >
            watch
          </button>
          <button
            onClick={() => launch(false)}
            disabled={launching}
            className="rounded border border-green-800 px-3 py-1 text-green-400 hover:bg-green-950 disabled:opacity-40"
          >
            {launching ? "launching…" : "▶ run scenario"}
          </button>
          <span className="text-neutral-600">
            ledger: {state?.ledger_entries ?? 0}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <OrderBook jobs={state?.jobs ?? []} />
        <PriceChart prices={state?.prices ?? {}} />
        <Leaderboard agents={state?.agents ?? []} />
        <Wallets agents={state?.agents ?? []} />
        <HiringGraph jobs={state?.jobs ?? []} />
        <EventFeed events={state?.events ?? []} />
        <DeclarativePanel spec={state?.job_detail ?? null} />
        <ReportFrame html={state?.report_html ?? null} />
        <ControlPanel pending={state?.pending_action ?? null} />
      </div>

      <footer className="text-[10px] text-neutral-600">
        gen-UI spectrum on one AG-UI connection —{" "}
        <span className="text-sky-400">controlled</span>: fixed widgets ·{" "}
        <span className="text-amber-400">declarative</span>: streamed UI spec ·{" "}
        <span className="text-fuchsia-400">open-ended</span>: agent-drawn HTML in a
        sandboxed iframe · high-impact actions gated by AG-UI HITL approval
      </footer>

      <ApprovalCard pending={state?.pending_action ?? null} />
    </main>
  );
}
