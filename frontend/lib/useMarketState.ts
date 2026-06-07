"use client";

import { useCoAgent } from "@copilotkit/react-core";
import { useAgent } from "@copilotkit/react-core/v2";

// A lesson an agent extracted from its own Weave score + rationale
// (self-improvement loop; see documentation/police_and_learning_backend_plan.md).
export type Lesson = {
  job_id: string;
  score: number;
  lesson: string;
  ts: number;
};

// Mirrors the backend's AG-UI STATE_SNAPSHOT payload (canopy/api/state.py).
export type AgentRow = {
  id: string;
  name: string;
  label: string; // human-readable role description
  model: string; // the actual base model doing the work
  strategy: string;
  model_tier: string;
  status: string;
  balance: number;
  reputation: number;
  jobs_won: number;
  jobs_failed: number;
  parent_id: string | null;
  frauds?: number; // audit convictions (reward-hacking police)
  lessons?: Lesson[]; // newest last, capped at 5 by the backend
};

export type BidRow = { agent_id: string; effective_bid: number };

export type JobRow = {
  id: string;
  spec: string;
  category: string;
  hops: number;
  bounty_cap: number;
  status: string;
  client_id: string;
  winner_id: string | null;
  price: number;
  parent_job_id: string | null;
  open: boolean;
  trace_url: string | null; // the execution call in Weave — proof on demand
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

// HITL: a high-impact action waiting for human approval.
export type PendingAction = {
  id: string;
  kind: string;
  label: string;
  params: Record<string, unknown>;
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
  pending_action: PendingAction | null;
  reserve_price: number;
  paused: boolean;
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
  pending_action: null,
  reserve_price: 0.5,
  paused: false,
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
  return runScenarioBody({
    jobs: opts?.jobs ?? 13,
    mock: opts?.mock ?? false,
    sabotage: true,
  });
}

// full control over the run config (fleet presets, custom rosters)
export async function runScenarioBody(body: Record<string, unknown>) {
  const res = await fetch(`${BACKEND}/sim/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ job_delay: 1.0, ...body }),
  });
  return res.json();
}

// --- HITL ControlPanel calls -------------------------------------------------

async function post(path: string, body: unknown) {
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
  return res.json();
}

export const control = {
  postJob: (spec: string, category: string, bountyCap: number, complexJob: boolean) =>
    post("/control/post_job", {
      spec,
      category,
      bounty_cap: bountyCap,
      complex_job: complexJob,
    }),
  demandSpike: (category: string | null, jobs: number) =>
    post("/control/demand_spike", { category, jobs }),
  setReserve: (price: number) => post("/control/reserve", { price }),
  requestAction: (kind: "kill_top_agent" | "inject_liquidity", amount?: number) =>
    post("/control/request_action", { kind, amount: amount ?? 50 }),
  approve: (actionId: string, approve: boolean) =>
    post("/control/approve", { action_id: actionId, approve }),
  pause: (paused: boolean) => post("/control/pause", { paused }),
};
