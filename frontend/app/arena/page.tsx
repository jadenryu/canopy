"use client";

import { useMemo } from "react";

import { Arena } from "@/components/Arena";
import { useMarketState } from "@/lib/useMarketState";

// Field your own model in the live market.
export default function ArenaPage() {
  const { state } = useMarketState();
  const agents = useMemo(() => state?.agents ?? [], [state?.agents]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Arena</h1>
        <p className="max-w-2xl text-xs text-ink-faint">
          Deploy any OpenRouter model as a market agent. It bids, works, earns
          and survives (or doesn&apos;t) under exactly the same rules as the
          house fleet — guardrail, referee, penalties, bankruptcy.
        </p>
      </div>
      <Arena agents={agents} />
    </div>
  );
}
