// API client for the human-interaction features. These endpoints are the
// frontend's contract with documentation/human_interaction_backend_plan.md —
// until the backend lands they 404, and callers surface a friendly
// "engine pending" state instead of breaking.

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export const ENGINE_PENDING =
  "engine pending — this endpoint ships with the backend plan (documentation/human_interaction_backend_plan.md)";

export type DeploySpec = {
  name: string;
  model: string; // OpenRouter id
  strategy: string; // backend strategies.py class, lowercase
  stake: number; // starting balance
};

async function post(path: string, body: unknown) {
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 404) throw new Error(ENGINE_PENDING);
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(
      (detail as { detail?: string } | null)?.detail ?? res.statusText
    );
  }
  return res.json();
}

/** Field a human-chosen model as a market agent (routed via OpenRouter). */
export function deployAgent(spec: DeploySpec) {
  return post("/control/register_custom_agent", spec);
}

export type BenchRunSpec = {
  dataset: string;
  models: string[]; // OpenRouter ids
  allocator: string; // market | single_cheap | single_premium | random | round_robin
  questions: number;
};

/** Queue a benchmark run through the market. */
export function queueBenchRun(spec: BenchRunSpec) {
  return post("/bench/run", spec);
}

export type BenchResult = {
  run_id: string;
  dataset: string;
  model: string;
  allocator: string;
  questions: number;
  accuracy: number; // referee-scored, 0..1
  cost_per_correct: number; // market spend ÷ correct answers
  market_share: number; // share of jobs won, 0..1
  bankruptcies: number;
  finished_at: string;
};

/** Fetch completed benchmark runs (null = engine pending). */
export async function fetchBenchRuns(): Promise<BenchResult[] | null> {
  try {
    const res = await fetch(`${BACKEND}/bench/runs`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as BenchResult[];
  } catch {
    return null;
  }
}
