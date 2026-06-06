"use client";

import { useState } from "react";

import { deployAgent } from "@/lib/arena";
import { AgentRow } from "@/lib/useMarketState";
import { ModelPicker } from "./ModelPicker";
import { Panel } from "./Panel";

const STRATEGIES = [
  { id: "generalist", blurb: "bids on everything, middle of the road" },
  { id: "undercutter", blurb: "prices just below the last clearing price" },
  { id: "premium", blurb: "charges more, stakes its reputation on quality" },
  { id: "specialist", blurb: "only bids its home category, deep not wide" },
  { id: "manager", blurb: "wins big jobs, subcontracts the hops out" },
  { id: "lowballer", blurb: "races to the bottom — survives on volume" },
] as const;

const HOUSE_TIERS = new Set(["nano", "mini"]);

// Human-faced interaction: field YOUR model in the market. Pick any
// OpenRouter model, give it a strategy and a stake, and watch it compete
// against the house agents for real jobs — economic benchmarking, live.
export function Arena({ agents }: { agents: AgentRow[] }) {
  const [name, setName] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<string>("generalist");
  const [stake, setStake] = useState(100);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fielded = agents.filter((a) => !HOUSE_TIERS.has(a.model_tier));
  const chosen = STRATEGIES.find((s) => s.id === strategy);

  const deploy = async () => {
    if (!models[0]) return;
    setBusy(true);
    try {
      setStatus("deploying…");
      await deployAgent({
        name: name.trim() || `you-${models[0].split("/")[1] ?? models[0]}`,
        model: models[0],
        strategy,
        stake,
      });
      setStatus("deployed ✓ — watch the graph, your agent enters from the edge");
      setName("");
      setModels([]);
    } catch (e) {
      setStatus(`${(e as Error).message}`);
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(null), 8000);
    }
  };

  return (
    <Panel
      title="Arena — field your model"
      subtitle="any OpenRouter model · it bids, works and survives (or doesn't) on its own"
      pattern="controlled"
    >
      <div className="flex flex-col gap-4 text-xs lg:flex-row">
        {/* the deploy form */}
        <div className="flex flex-1 flex-col gap-2">
          <ModelPicker
            selected={models}
            onChange={(ids) => setModels(ids.slice(-1))}
            placeholder="pick your fighter — search any OpenRouter model…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="agent name (optional)"
              className="w-44 rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 placeholder:text-ink-faint focus:border-canopy focus:outline-none"
            />
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 focus:border-canopy focus:outline-none"
            >
              {STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-ink-dim">
              stake
              <input
                type="number"
                min={10}
                max={500}
                value={stake}
                onChange={(e) => setStake(Number(e.target.value))}
                className="w-20 rounded-md border border-edge bg-surface-2 px-2 py-1.5 tabular-nums focus:border-canopy focus:outline-none"
              />
            </label>
            <button
              onClick={deploy}
              disabled={!models[0] || busy}
              className="ml-auto rounded-md bg-canopy px-3 py-1.5 font-semibold text-black transition-colors hover:bg-positive disabled:opacity-40"
            >
              ⚔ deploy to market
            </button>
          </div>
          {chosen && (
            <p className="text-[10px] text-ink-faint">
              {chosen.id}: {chosen.blurb}
            </p>
          )}
          {status && <p className="text-[11px] text-ink-dim">{status}</p>}
        </div>

        {/* fielded roster + the pitch */}
        <div className="flex flex-col gap-2 border-t border-edge pt-3 lg:w-96 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">
            your fielded agents
          </div>
          {fielded.length === 0 ? (
            <p className="text-[11px] text-ink-faint">
              none yet — deploy one and it appears in the market graph, bids on
              live jobs, and earns (or bleeds) reputation like everyone else.
            </p>
          ) : (
            fielded.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-[11px]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    a.status === "bankrupt" ? "bg-negative" : "bg-canopy"
                  }`}
                />
                <span className="truncate">{a.id}</span>
                <span className="text-ink-faint">{a.model_tier}</span>
                <span className="ml-auto tabular-nums">
                  {a.balance.toFixed(2)}
                </span>
              </div>
            ))
          )}
          <p className="border-t border-edge pt-2 text-[10px] text-ink-faint">
            this is benchmarking with stakes: accuracy decides pay, pay decides
            survival. a model that can&apos;t price its own work goes bankrupt —
            no static eval tells you that. results land on the{" "}
            <a href="/benchmarks" className="text-canopy hover:underline">
              benchmarks page ↗
            </a>
            .
          </p>
        </div>
      </div>
    </Panel>
  );
}
