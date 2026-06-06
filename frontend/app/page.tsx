"use client";

import { useMarketState } from "@/lib/useMarketState";

// Phase 0: prove the AG-UI pipe works — render one value from shared state.
// Later phases replace this with the trading floor (OrderBook, PriceChart,
// Leaderboard, Wallets, HiringGraph, EventFeed, ControlPanel).
export default function Home() {
  const { state, run } = useMarketState();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 font-mono">
      <h1 className="text-3xl font-bold tracking-tight">🌳 Canopy</h1>
      <p className="text-sm opacity-70">
        self-organizing agent labor market — phase 0 skeleton
      </p>

      <div className="rounded-lg border border-neutral-700 p-6 text-sm">
        <div>
          market: <span className="font-bold">{state?.market ?? "—"}</span>
        </div>
        <div>
          redis:{" "}
          <span
            className={state?.redis_connected ? "text-green-500" : "text-red-500"}
          >
            {state?.redis_connected ? "connected" : "disconnected"}
          </span>
        </div>
        <div>agents: {state?.agents?.length ?? 0}</div>
        <div>open jobs: {state?.order_book?.length ?? 0}</div>
      </div>

      <button
        onClick={() => run?.()}
        className="rounded-md border border-neutral-600 px-4 py-2 text-sm hover:bg-neutral-800"
      >
        ping market
      </button>
    </main>
  );
}
