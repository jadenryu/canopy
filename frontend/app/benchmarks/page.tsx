"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Empty } from "@/components/Empty";
import { ModelPicker } from "@/components/ModelPicker";
import { Panel } from "@/components/Panel";
import {
  BenchResult,
  fetchBenchRuns,
  queueBenchRun,
} from "@/lib/arena";

// Importable multi-hop QA benchmarks — the same shape as Canopy's job
// domain, so each question becomes a market job with a ground-truth answer.
const DATASETS = [
  {
    id: "hotpotqa",
    name: "HotpotQA",
    size: "113k",
    hops: "2-hop",
    blurb: "Wikipedia multi-hop QA — the classic. Bridge & comparison questions.",
  },
  {
    id: "2wikimultihopqa",
    name: "2WikiMultiHopQA",
    size: "193k",
    hops: "2-hop",
    blurb: "Compositional questions with explicit reasoning paths.",
  },
  {
    id: "musique",
    name: "MuSiQue",
    size: "25k",
    hops: "2–4 hop",
    blurb: "Composed single-hop chains — hard to shortcut, great for subcontracts.",
  },
  {
    id: "bamboogle",
    name: "Bamboogle",
    size: "125",
    hops: "2-hop",
    blurb: "Handcrafted search-resistant questions. Small, brutal, fast to run.",
  },
  {
    id: "frames",
    name: "FRAMES",
    size: "824",
    hops: "multi",
    blurb: "Multi-document reasoning with factuality scoring (Google, 2024).",
  },
];

const ALLOCATORS = [
  { id: "market", name: "market (canopy)", blurb: "full auction: bids, reputation weighting, subcontracts" },
  { id: "single_cheap", name: "single · cheap", blurb: "one nano-tier model answers everything" },
  { id: "single_premium", name: "single · premium", blurb: "one premium model answers everything" },
  { id: "round_robin", name: "round robin", blurb: "jobs dealt out in turn, no economics" },
  { id: "random", name: "random", blurb: "jobs assigned at random — the floor" },
];

export default function Benchmarks() {
  const [dataset, setDataset] = useState("bamboogle");
  const [models, setModels] = useState<string[]>([]);
  const [allocator, setAllocator] = useState("market");
  const [questions, setQuestions] = useState(10);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<BenchResult[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let on = true;
    fetchBenchRuns().then((r) => {
      if (on) {
        setRuns(r);
        setLoaded(true);
      }
    });
    return () => {
      on = false;
    };
  }, []);

  const queue = async () => {
    setBusy(true);
    try {
      setStatus("queueing run…");
      await queueBenchRun({ dataset, models, allocator, questions });
      setStatus("queued ✓ — results appear below when the round settles");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(null), 8000);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col gap-4 bg-bg px-6 py-4 text-ink">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-bold uppercase tracking-tight">
            🌳 Canopy <span className="text-canopy">/ benchmarks</span>
          </h1>
          <span className="text-xs text-ink-faint">
            models tested where it hurts — inside a live economy
          </span>
        </div>
        <Link
          href="/"
          className="rounded-md border border-edge px-3 py-1 text-xs text-ink-dim transition-colors hover:border-edge-2 hover:text-ink"
        >
          ← trading floor
        </Link>
      </header>

      {/* the pitch — why this is different from a static eval */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-y border-edge px-1 py-1.5 text-[11px] text-ink-dim">
        <span>
          static benchmarks score <span className="text-ink">answers</span> —
          canopy scores <span className="text-canopy">economic fitness</span>:
        </span>
        <span className="text-positive">accuracy</span>
        <span className="text-working">cost per correct</span>
        <span className="text-info">market share won</span>
        <span className="text-negative">survival</span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* dataset catalog */}
        <Panel
          title="Datasets"
          subtitle="multi-hop QA with ground truth — each question becomes a job"
          pattern="controlled"
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DATASETS.map((d) => {
              const on = dataset === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setDataset(d.id)}
                  className={`flex flex-col gap-1 rounded-md border p-2.5 text-left transition-colors ${
                    on
                      ? "border-canopy/50 bg-canopy/5"
                      : "border-edge hover:border-edge-2 hover:bg-surface-2/60"
                  }`}
                >
                  <span className="flex items-baseline gap-2 text-xs">
                    <span className={on ? "text-canopy" : "text-ink"}>{d.name}</span>
                    <span className="text-[10px] text-ink-faint">
                      {d.size} · {d.hops}
                    </span>
                    {on && <span className="ml-auto text-canopy">✓</span>}
                  </span>
                  <span className="text-[10px] leading-4 text-ink-dim">{d.blurb}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        {/* run config */}
        <Panel title="Run config" subtitle="queue a market round over the dataset" pattern="controlled">
          <div className="flex flex-col gap-2.5 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-ink-faint">
              contender models (openrouter)
            </div>
            <ModelPicker selected={models} onChange={setModels} multi />
            <div className="text-[10px] uppercase tracking-wider text-ink-faint">
              allocator
            </div>
            <select
              value={allocator}
              onChange={(e) => setAllocator(e.target.value)}
              className="rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 focus:border-canopy focus:outline-none"
            >
              {ALLOCATORS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-ink-faint">
              {ALLOCATORS.find((a) => a.id === allocator)?.blurb}
            </p>
            <label className="flex items-center gap-2 text-ink-dim">
              questions
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={questions}
                onChange={(e) => setQuestions(Number(e.target.value))}
                className="flex-1 accent-(--color-canopy)"
              />
              <span className="w-8 text-right tabular-nums text-ink">{questions}</span>
            </label>
            <button
              onClick={queue}
              disabled={busy || models.length === 0}
              className="rounded-md bg-canopy px-3 py-1.5 font-semibold text-black transition-colors hover:bg-positive disabled:opacity-40"
            >
              Queue benchmark run
            </button>
            {status && <p className="text-[11px] text-ink-dim">{status}</p>}
          </div>
        </Panel>

        {/* results */}
        <Panel
          title="Results"
          subtitle="weave.Evaluation per run — referee-scored, market-priced"
          pattern="controlled"
          accent
          className="lg:col-span-3"
        >
          {!loaded ? (
            <Empty glyph="◌">loading…</Empty>
          ) : runs === null ? (
            <Empty
              glyph="⚙"
              hint="frontend contract is live; endpoints specced in documentation/human_interaction_backend_plan.md"
            >
              results engine pending — runs will land here with accuracy, cost
              per correct, market share and survival per model
            </Empty>
          ) : runs.length === 0 ? (
            <Empty glyph="◌" hint="queue a run above">
              no runs yet
            </Empty>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-ink-faint">
                  <th className="pb-1 pr-2 font-medium">run</th>
                  <th className="pb-1 pr-2 font-medium">dataset</th>
                  <th className="pb-1 pr-2 font-medium">model</th>
                  <th className="pb-1 pr-2 font-medium">allocator</th>
                  <th className="pb-1 pr-2 text-right font-medium">accuracy</th>
                  <th className="pb-1 pr-2 text-right font-medium">cost/correct</th>
                  <th className="pb-1 pr-2 text-right font-medium">market share</th>
                  <th className="pb-1 text-right font-medium">bankruptcies</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={`${r.run_id}-${r.model}`} className="border-t border-edge/60 hover:bg-surface-2/60">
                    <td className="py-1 pr-2 text-ink-dim">{r.run_id}</td>
                    <td className="py-1 pr-2">{r.dataset}</td>
                    <td className="py-1 pr-2">{r.model}</td>
                    <td className="py-1 pr-2 text-ink-dim">{r.allocator}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-positive">
                      {(r.accuracy * 100).toFixed(1)}%
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-working">
                      {r.cost_per_correct.toFixed(2)}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-info">
                      {(r.market_share * 100).toFixed(0)}%
                    </td>
                    <td
                      className={`py-1 text-right tabular-nums ${
                        r.bankruptcies > 0 ? "text-negative" : "text-ink-dim"
                      }`}
                    >
                      {r.bankruptcies}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <footer className="text-[10px] text-ink-faint">
        every run is a formal weave.Evaluation — same referee scorer that settles
        live trades · models routed through OpenRouter · the market allocator is
        the product: compare it against the baselines
      </footer>
    </main>
  );
}
