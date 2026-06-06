"use client";

import { useCoAgent } from "@copilotkit/react-core";
import { useAgent } from "@copilotkit/react-core/v2";

// Mirrors the backend's AG-UI STATE_SNAPSHOT payload (canopy/api/agui.py).
export type MarketState = {
  market: string;
  redis_connected: boolean;
  agents: unknown[];
  order_book: unknown[];
  events: unknown[];
};

export function useMarketState() {
  const { state, running } = useCoAgent<MarketState>({
    name: "canopy_market",
    initialState: {
      market: "canopy",
      redis_connected: false,
      agents: [],
      order_book: [],
      events: [],
    },
  });

  // NOTE: useCoAgent's returned start/run are UNBOUND references to
  // agent.runAgent (CopilotKit 1.59.5 bug) — calling them throws
  // "Cannot set properties of undefined (setting 'abortController')".
  // Work around it by invoking runAgent as a bound method via useAgent.
  const { agent } = useAgent({ agentId: "canopy_market" });
  const start = () => agent?.runAgent();

  return { state, start, running };
}
