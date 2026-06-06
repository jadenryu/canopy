"use client";

import { useCoAgent } from "@copilotkit/react-core";
import { useAgent } from "@copilotkit/react-core/v2";

// Mirrors the backend's AG-UI STATE_SNAPSHOT payload (canopy/api/state.py).
export type AgentRow = {
  id: string;
  name: string;
  strategy: string;
  model_tier: string;
  status: string;
  balance: number;
  reputation: number;
  jobs_won: number;
  jobs_failed: number;
  parent_id: string | null;
};

export type BidRow = { agent_id: string; effective_bid: number };

export type JobRow = {
  id: string;
  spec: string;
  category: string;
  hops: number;
  status: string;
  client_id: string;
  winner_id: string | null;
  price: number;
  parent_job_id: string | null;
  open: boolean;
  bids: BidRow[];
};

export type MarketEvent = {
  ts: number;
  type: string;
  payload: Record<string, unknown>;
};

// Declarative gen-UI spec (backend streams it; DeclarativePanel walks it).
export type SpecSection =
  | { type: "stats"; items: { label: string; value: string }[] }
  | {
      type: "table";
      columns: string[];
      rows: { cells: string[]; highlight?: boolean }[];
    }
  | { type: "note"; text: string };

export type UISpec = {
  type: "panel";
  title: string;
  subtitle?: string;
  sections: SpecSection[];
};

export type MarketState = {
  market: string;
  redis_connected: boolean;
  agents: AgentRow[];
  jobs: JobRow[];
  events: MarketEvent[];
  prices: Record<string, number[]>;
  ledger_entries: number;
  job_detail: UISpec | null;
  report_html: string | null;
};

const INITIAL: MarketState = {
  market: "canopy",
  redis_connected: false,
  agents: [],
  jobs: [],
  events: [],
  prices: {},
  ledger_entries: 0,
  job_detail: null,
  report_html: null,
};

export function useMarketState() {
  const { state, running } = useCoAgent<MarketState>({
    name: "canopy_market",
    initialState: INITIAL,
  });

  // NOTE: useCoAgent's returned start/run are UNBOUND references to
  // agent.runAgent (CopilotKit 1.59.5 bug) — calling them throws
  // "Cannot set properties of undefined (setting 'abortController')".
  // Work around it by invoking runAgent as a bound method via useAgent.
  const { agent } = useAgent({ agentId: "canopy_market" });
  const start = () => agent?.runAgent();

  return { state, start, running };
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function runScenario(opts?: { jobs?: number; mock?: boolean }) {
  const res = await fetch(`${BACKEND}/sim/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jobs: opts?.jobs ?? 13,
      mock: opts?.mock ?? false,
      sabotage: true,
      job_delay: 1.0,
    }),
  });
  return res.json();
}
