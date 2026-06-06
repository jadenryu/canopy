"use client";

import { useState } from "react";

import { control, PendingAction } from "@/lib/useMarketState";
import { Panel } from "./Panel";

const CATEGORIES = ["film", "geography", "science", "history", "literature", "general"];

const INPUT =
  "rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 placeholder:text-ink-faint focus:border-canopy focus:outline-none focus:shadow-[0_0_0_1px_var(--color-canopy)]";

function HitlChip() {
  return (
    <span className="rounded-sm bg-working/15 px-1 py-px text-[9px] font-semibold tracking-wider text-working">
      HITL
    </span>
  );
}

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
    <Panel title="Control panel (human-in-the-loop)" pattern="controlled">
      <div className="flex flex-col gap-4 text-xs lg:flex-row">
        {/* post a job — the human becomes a Client */}
        <div className="flex flex-1 flex-col gap-2">
          <textarea
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder="post a job: ask a (multi-hop) question…"
            rows={2}
            className={`resize-none ${INPUT}`}
          />
          <div className="flex flex-wrap items-center gap-2">
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
              complex (3-hop)
            </label>
            <button
              onClick={() =>
                act(() => control.postJob(spec, category, 10, complexJob), "posting")
              }
              disabled={!spec.trim()}
              className="ml-auto rounded-md border border-info/40 bg-info/15 px-3 py-1 text-info transition-colors hover:bg-info/25 disabled:opacity-40"
            >
              post job
            </button>
          </div>
        </div>

        {/* central bank + shocks */}
        <div className="flex flex-col gap-2 border-t border-edge pt-3 lg:w-96 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => act(() => control.demandSpike(null, 5), "demand spike")}
              className="rounded-md border border-working/40 px-2.5 py-1 text-working transition-colors hover:bg-working/10"
            >
              ⚡ demand spike ×5
            </button>
            <button
              onClick={() =>
                act(() => control.requestAction("inject_liquidity", 50), "requesting")
              }
              disabled={!!pending}
              className="flex items-center gap-1.5 rounded-md border border-positive/40 px-2.5 py-1 text-positive transition-colors hover:bg-positive/10 disabled:opacity-40"
            >
              💰 inject liquidity (+50) <HitlChip />
            </button>
            <button
              onClick={() => act(() => control.requestAction("kill_top_agent"), "requesting")}
              disabled={!!pending}
              className="flex items-center gap-1.5 rounded-md border border-negative/40 px-2.5 py-1 text-negative transition-colors hover:bg-negative/10 disabled:opacity-40"
            >
              ☠ kill top agent <HitlChip />
            </button>
          </div>
          <p className="text-[10px] text-ink-faint">
            HITL actions require approval via AG-UI shared state — an approval card
            takes over the screen.
          </p>
          {status && <p className="text-[11px] text-ink-dim">{status}</p>}
        </div>
      </div>
    </Panel>
  );
}

// The AG-UI HITL gate: backend put `pending_action` into shared state and
// suspended; nothing executes until the human resolves it here.
export function ApprovalCard({ pending }: { pending: PendingAction | null }) {
  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-50">
      {/* dim the floor — attention snaps to the gate */}
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute right-4 bottom-4 w-96 animate-slide-in rounded-lg border border-working/60 bg-surface p-4 shadow-[0_0_24px_rgba(251,191,36,0.2)]">
        <div className="pointer-events-none absolute inset-0 animate-pulse-dot rounded-lg border border-working/50" />
        <div className="mb-1 text-[10px] font-bold tracking-widest text-working uppercase">
          approval required (AG-UI HITL)
        </div>
        <div className="mb-3 font-sans text-sm text-ink">{pending.label}</div>
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => control.approve(pending.id, true)}
            className="flex-1 rounded-md bg-positive/90 px-3 py-1.5 font-semibold text-black transition-colors hover:bg-positive"
          >
            ✓ approve
          </button>
          <button
            onClick={() => control.approve(pending.id, false)}
            className="flex-1 rounded-md border border-edge px-3 py-1.5 text-ink-dim transition-colors hover:border-edge-2 hover:text-ink"
          >
            ✗ reject
          </button>
        </div>
      </div>
    </div>
  );
}
