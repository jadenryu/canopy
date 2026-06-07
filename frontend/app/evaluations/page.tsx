"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { Panel } from "@/components/Panel";
import { BenchResult, fetchBenchRuns } from "@/lib/arena";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type EvalRow = {
  condition: string;
  quality: number;
  accuracy: number;
  paid_per_job: number;
  quality_per_dollar: number;
  seeds: number;
};

type EvalResults = {
  evaluation: string;
  description: string;
  table: EvalRow[];
  weave_url: string;
};

const CONDITION_LABELS: Record<string, string> = {
  market: "Market (reverse auction)",
  single_cheap: "Single cheap agent",
  single_premium: "Single premium agent",
  random: "Random assignment",
  round_robin: "Round-robin",
};

// Weave's analysis, opened up — the formal allocator evaluation and every
// benchmark run, comparable side by side, deep-linked to the Weave project.
export default function EvaluationsPage() {
  const [evals, setEvals] = useState<EvalResults | null>(null);
  const [runs, setRuns] = useState<BenchResult[] | null>(null);

  useEffect(() => {
    fetch(`${BACKEND}/eval/results`)
      .then((r) => r.json())
      .then(setEvals)
      .catch(() => setEvals(null));
    fetchBenchRuns().then(setRuns);
  }, []);

  const best = evals?.table?.[0]?.condition;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Evaluations</h1>
          <p className="max-w-2xl text-xs text-ink-faint">
            The same Weave referee that settles live trades runs the formal
            evaluations. Allocator comparison below is the headline experiment;
            benchmark runs compare models on economic fitness.
          </p>
        </div>
        {evals && (
          <a
            href={evals.weave_url}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 text-xs text-ink-dim hover:border-edge-2 hover:text-ink"
          >
            Open in Weave <ExternalLink size={12} />
          </a>
        )}
      </div>

      <Panel
        title="Allocator comparison"
        subtitle={evals?.description ?? "canopy-allocator-eval"}
        pattern="controlled"
        accent
      >
        {!evals || evals.table.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-faint">
            No evaluation results found — run `canopy.eval.run_eval`.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-3 font-medium">Allocation rule</th>
                <th className="pb-2 pr-3 text-right font-medium">Quality</th>
                <th className="pb-2 pr-3 text-right font-medium">Accuracy</th>
                <th className="pb-2 pr-3 text-right font-medium">Paid / job</th>
                <th className="pb-2 pr-3 text-right font-medium">Quality per $</th>
                <th className="pb-2 text-right font-medium">Seeds</th>
              </tr>
            </thead>
            <tbody>
              {evals.table.map((row) => (
                <tr
                  key={row.condition}
                  className={`border-t border-edge/60 ${
                    row.condition === "market" ? "bg-canopy/5" : ""
                  }`}
                >
                  <td className="py-2.5 pr-3">
                    <span className="text-ink">
                      {CONDITION_LABELS[row.condition] ?? row.condition}
                    </span>
                    {row.condition === best && (
                      <span className="ml-2 rounded border border-canopy/40 px-1.5 py-0.5 text-[10px] text-canopy">
                        best value
                      </span>
                    )}
                  </td>
                  <td className="num py-2.5 pr-3 text-right text-ink">
                    {row.quality.toFixed(3)}
                  </td>
                  <td className="num py-2.5 pr-3 text-right text-ink-dim">
                    {(row.accuracy * 100).toFixed(0)}%
                  </td>
                  <td className="num py-2.5 pr-3 text-right text-ink-dim">
                    {row.paid_per_job.toFixed(2)}
                  </td>
                  <td className="num py-2.5 pr-3 text-right text-ink">
                    {row.quality_per_dollar.toFixed(3)}
                  </td>
                  <td className="num py-2.5 text-right text-ink-faint">{row.seeds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel
        title="Benchmark runs"
        subtitle="models compared on economic fitness — accuracy, unit cost, share, survival"
        pattern="controlled"
      >
        {!runs || runs.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-faint">
            No benchmark runs yet — queue one from the Benchmarks page.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-3 font-medium">Run</th>
                <th className="pb-2 pr-3 font-medium">Model</th>
                <th className="pb-2 pr-3 font-medium">Dataset / allocator</th>
                <th className="pb-2 pr-3 text-right font-medium">Accuracy</th>
                <th className="pb-2 pr-3 text-right font-medium">Cost / correct</th>
                <th className="pb-2 pr-3 text-right font-medium">Market share</th>
                <th className="pb-2 text-right font-medium">Bankruptcies</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={`${r.run_id}-${r.model}-${i}`} className="border-t border-edge/60">
                  <td className="num py-2 pr-3 text-ink-faint">{r.run_id}</td>
                  <td className="py-2 pr-3 text-ink">{r.model}</td>
                  <td className="py-2 pr-3 text-ink-dim">
                    {r.dataset} · {r.allocator}
                  </td>
                  <td className="num py-2 pr-3 text-right text-ink">
                    {(r.accuracy * 100).toFixed(0)}%
                  </td>
                  <td className="num py-2 pr-3 text-right text-ink-dim">
                    {r.cost_per_correct ? r.cost_per_correct.toFixed(2) : "—"}
                  </td>
                  <td className="num py-2 pr-3 text-right text-ink-dim">
                    {r.allocator === "market" ? `${(r.market_share * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="num py-2 text-right text-ink-dim">{r.bankruptcies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
