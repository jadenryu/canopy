"use client";

import { useState } from "react";

import { control, PendingAction } from "@/lib/useMarketState";
import { Panel } from "./Panel";

const CATEGORIES = ["film", "geography", "science", "history", "literature", "general"];

// HITL: post a job (become a Client) and steer the economy as the central
// bank. High-impact actions don't execute directly — they land in AG-UI
// shared state as `pending_action`, and the ApprovalCard below gates them.
export function ControlPanel({ pending }: { pending: PendingAction | null }) {
  const [spec, setSpec] = useState("");
  const [category, setCategory] = useState("general");
  const [complexJob, setComplexJob] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>, label: string) => {
    try {
      setStatus(`${label}…`);
      await fn();
      setStatus(`${label} ✓`);
    } catch (e) {
      setStatus(`${label} failed: ${(e as Error).message}`);
    }
    setTimeout(() => setStatus(null), 4000);
  };

  return (
    <Panel title="Control panel (human-in-the-loop)" pattern="controlled" className="h-72">
      <div className="flex h-full flex-col gap-3 text-xs">
        {/* post a job — the human becomes a Client */}
        <div className="flex flex-col gap-1.5">
          <textarea
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder="post a job: ask a (multi-hop) question…"
            rows={2}
            className="resize-none rounded border border-neutral-800 bg-neutral-900 px-2 py-1 placeholder:text-neutral-600"
          />
          <div className="flex items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded border border-neutral-800 bg-neutral-900 px-1 py-0.5"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-neutral-400">
              <input
                type="checkbox"
                checked={complexJob}
                onChange={(e) => setComplexJob(e.target.checked)}
              />
              complex (3-hop)
            </label>
            <button
              onClick={() =>
                act(() => control.postJob(spec, category, 10, complexJob), "posting")
              }
              disabled={!spec.trim()}
              className="ml-auto rounded border border-sky-800 px-2 py-0.5 text-sky-400 hover:bg-sky-950 disabled:opacity-40"
            >
              post job
            </button>
          </div>
        </div>

        {/* central bank + shocks */}
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-900 pt-2">
          <button
            onClick={() => act(() => control.demandSpike(null, 5), "demand spike")}
            className="rounded border border-amber-800 px-2 py-0.5 text-amber-400 hover:bg-amber-950"
          >
            ⚡ demand spike ×5
          </button>
          <button
            onClick={() => act(() => control.requestAction("inject_liquidity", 50), "requesting")}
            disabled={!!pending}
            className="rounded border border-emerald-800 px-2 py-0.5 text-emerald-400 hover:bg-emerald-950 disabled:opacity-40"
          >
            💰 inject liquidity (+50)
          </button>
          <button
            onClick={() => act(() => control.requestAction("kill_top_agent"), "requesting")}
            disabled={!!pending}
            className="rounded border border-red-800 px-2 py-0.5 text-red-400 hover:bg-red-950 disabled:opacity-40"
          >
            ☠ kill top agent
          </button>
        </div>
        <p className="text-[10px] text-neutral-600">
          💰/☠ are high-impact: they require approval via AG-UI shared state (card appears below).
        </p>
        {status && <p className="text-[11px] text-neutral-400">{status}</p>}
      </div>
    </Panel>
  );
}

// The AG-UI HITL gate: backend put `pending_action` into shared state and
// suspended; nothing executes until the human resolves it here.
export function ApprovalCard({ pending }: { pending: PendingAction | null }) {
  if (!pending) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 rounded-lg border border-amber-600 bg-neutral-950 p-4 shadow-xl shadow-amber-950">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-amber-500">
        approval required (AG-UI HITL)
      </div>
      <div className="mb-3 text-sm text-neutral-200">{pending.label}</div>
      <div className="flex gap-2 text-xs">
        <button
          onClick={() => control.approve(pending.id, true)}
          className="flex-1 rounded border border-green-700 px-3 py-1.5 text-green-400 hover:bg-green-950"
        >
          ✓ approve
        </button>
        <button
          onClick={() => control.approve(pending.id, false)}
          className="flex-1 rounded border border-neutral-700 px-3 py-1.5 text-neutral-400 hover:bg-neutral-900"
        >
          ✗ reject
        </button>
      </div>
    </div>
  );
}
