"use client";

import { Banknote, Power, Zap } from "lucide-react";
import { useState } from "react";

import { control, PendingAction } from "@/lib/useMarketState";
import { Panel } from "./Panel";

const CATEGORIES = ["film", "geography", "science", "history", "literature", "general"];

const INPUT =
  "rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 text-xs placeholder:text-ink-faint focus:border-canopy focus:outline-none";

function ApprovalTag() {
  return (
    <span className="rounded border border-edge px-1 py-px text-[9px] text-ink-faint">
      requires approval
    </span>
  );
}

// Human-in-the-loop controls: post work into the market as a client, and
// steer the economy as the central bank. High-impact actions land in
// AG-UI shared state as `pending_action`; nothing executes until the
// approval card is resolved.
export function ControlPanel({ pending }: { pending: PendingAction | null }) {
  const [spec, setSpec] = useState("");
  const [category, setCategory] = useState("general");
  const [complexJob, setComplexJob] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>, label: string) => {
    try {
      setStatus(`${label}…`);
      await fn();
      setStatus(`${label} — done`);
    } catch (e) {
      setStatus(`${label} failed: ${(e as Error).message}`);
    }
    setTimeout(() => setStatus(null), 4000);
  };

  return (
    <Panel title="Controls" subtitle="human in the loop" pattern="controlled">
      <div className="flex flex-col gap-4 text-xs lg:flex-row">
        {/* post a job — the human becomes a client */}
        <div className="flex flex-1 flex-col gap-2">
          <textarea
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder="Post a job: ask a multi-hop question…"
            rows={2}
            className={`resize-none ${INPUT}`}
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={INPUT}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-ink-dim">
              <input
                type="checkbox"
                checked={complexJob}
                onChange={(e) => setComplexJob(e.target.checked)}
                className="accent-(--color-canopy)"
              />
              Complex (3-hop)
            </label>
            <button
              onClick={() =>
                act(() => control.postJob(spec, category, 10, complexJob), "Posting")
              }
              disabled={!spec.trim()}
              className="ml-auto rounded-md bg-canopy px-3 py-1.5 font-medium text-[#06241a] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Post job
            </button>
          </div>
        </div>

        {/* central bank + shocks */}
        <div className="flex flex-col gap-2 border-t border-edge pt-3 lg:w-[26rem] lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => act(() => control.demandSpike(null, 5), "Demand spike")}
              className="flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1.5 text-ink-dim transition-colors hover:border-edge-2 hover:text-ink"
            >
              <Zap size={12} /> Demand spike ×5
            </button>
            <button
              onClick={() =>
                act(() => control.requestAction("inject_liquidity", 50), "Requesting")
              }
              disabled={!!pending}
              className="flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1.5 text-ink-dim transition-colors hover:border-edge-2 hover:text-ink disabled:opacity-40"
            >
              <Banknote size={12} /> Inject liquidity <ApprovalTag />
            </button>
            <button
              onClick={() => act(() => control.requestAction("kill_top_agent"), "Requesting")}
              disabled={!!pending}
              className="flex items-center gap-1.5 rounded-md border border-negative/40 px-2.5 py-1.5 text-negative transition-colors hover:bg-negative/10 disabled:opacity-40"
            >
              <Power size={12} /> Kill top agent <ApprovalTag />
            </button>
          </div>
          <p className="text-[11px] leading-4 text-ink-faint">
            High-impact actions are routed through AG-UI shared state and
            execute only after explicit approval.
          </p>
          {status && <p className="text-[11px] text-ink-dim">{status}</p>}
        </div>
      </div>
    </Panel>
  );
}

// The approval gate: the backend has suspended a high-impact action into
// shared state; nothing executes until the human resolves it here.
export function ApprovalCard({ pending }: { pending: PendingAction | null }) {
  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" />
      <div className="absolute right-5 bottom-5 w-96 animate-slide-in rounded-lg border border-edge-2 bg-surface p-4 shadow-xl">
        <div className="mb-1 text-[11px] font-medium text-working">
          Approval required
        </div>
        <div className="mb-1 text-sm text-ink">{pending.label}</div>
        <p className="mb-3 text-[11px] text-ink-faint">
          Requested via AG-UI shared state. The action executes only on approval.
        </p>
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => control.approve(pending.id, true)}
            className="flex-1 rounded-md bg-canopy px-3 py-1.5 font-medium text-[#06241a] transition-opacity hover:opacity-90"
          >
            Approve
          </button>
          <button
            onClick={() => control.approve(pending.id, false)}
            className="flex-1 rounded-md border border-edge px-3 py-1.5 text-ink-dim transition-colors hover:border-edge-2 hover:text-ink"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
