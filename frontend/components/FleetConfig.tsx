"use client";

import { useEffect, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type Preset = { id: string; name: string; blurb: string };
type Presets = {
  presets: Preset[];
  models: { house: string[]; openrouter: string[] };
  strategies: string[];
  openrouter_enabled: boolean;
};

type Member = { model: string; strategy: string; stake: number };

// Pre-run fleet configurator. Pick a preset, or build a custom roster of
// models + strategies. "Model battle" is the model-comparison view: each
// agent is a different base model running the same generalist strategy, so
// auction wins attribute to the model, not a hand-picked specialty.
export function FleetConfig({
  open,
  onClose,
  onRun,
}: {
  open: boolean;
  onClose: () => void;
  onRun: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [meta, setMeta] = useState<Presets | null>(null);
  const [preset, setPreset] = useState("emergence");
  const [jobs, setJobs] = useState(13);
  const [custom, setCustom] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || meta) return;
    fetch(`${BACKEND}/sim/presets`)
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setMeta(null));
  }, [open, meta]);

  const allModels = meta ? [...meta.models.house, ...meta.models.openrouter] : [];

  const addMember = () =>
    setCustom((c) => [
      ...c,
      { model: allModels[0] ?? "gpt-5.4-nano", strategy: "generalist", stake: 100 },
    ]);

  const run = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { jobs, preset, sabotage: preset === "emergence" };
      if (preset === "custom") body.fleet = custom;
      await onRun(body);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[28rem] overflow-y-auto border-edge bg-surface sm:max-w-[28rem]">
        <SheetHeader>
          <SheetTitle className="text-ink">Configure scenario</SheetTitle>
          <SheetDescription className="text-xs text-ink-dim">
            Choose who competes before opening the market.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-6 text-xs">
          {/* preset cards */}
          <div className="flex flex-col gap-2">
            {(meta?.presets ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`flex flex-col gap-1 rounded-md border p-2.5 text-left transition-colors ${
                  preset === p.id
                    ? "border-canopy/50 bg-canopy/5"
                    : "border-edge hover:border-edge-2"
                }`}
              >
                <span className={preset === p.id ? "text-canopy" : "text-ink"}>{p.name}</span>
                <span className="text-[11px] leading-4 text-ink-faint">{p.blurb}</span>
              </button>
            ))}
          </div>

          {/* custom roster builder */}
          {preset === "custom" && (
            <div className="flex flex-col gap-2 rounded-md border border-edge p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-ink-faint">
                  Roster
                </span>
                <button
                  onClick={addMember}
                  className="rounded border border-edge px-2 py-0.5 text-[11px] text-ink-dim hover:border-edge-2 hover:text-ink"
                >
                  + add agent
                </button>
              </div>
              {custom.length === 0 && (
                <p className="py-2 text-center text-[11px] text-ink-faint">
                  Add at least one agent.
                </p>
              )}
              {custom.map((m, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select
                    value={m.model}
                    onChange={(e) =>
                      setCustom((c) =>
                        c.map((x, j) => (j === i ? { ...x, model: e.target.value } : x))
                      )
                    }
                    className="min-w-0 flex-1 rounded border border-edge bg-surface-2 px-1.5 py-1 text-[11px] focus:border-canopy focus:outline-none"
                  >
                    {allModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                  <select
                    value={m.strategy}
                    onChange={(e) =>
                      setCustom((c) =>
                        c.map((x, j) => (j === i ? { ...x, strategy: e.target.value } : x))
                      )
                    }
                    className="rounded border border-edge bg-surface-2 px-1.5 py-1 text-[11px] focus:border-canopy focus:outline-none"
                  >
                    {(meta?.strategies ?? []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setCustom((c) => c.filter((_, j) => j !== i))}
                    className="px-1 text-ink-faint hover:text-negative"
                    title="remove"
                  >
                    ×
                  </button>
                </div>
              ))}
              {!meta?.openrouter_enabled && (
                <p className="text-[10px] text-ink-faint">
                  Only house models available — set OPENROUTER_API_KEY to field others.
                </p>
              )}
            </div>
          )}

          {/* jobs */}
          <label className="flex items-center gap-2 text-ink-dim">
            Jobs
            <input
              type="range"
              min={4}
              max={30}
              value={jobs}
              onChange={(e) => setJobs(Number(e.target.value))}
              className="flex-1 accent-(--color-canopy)"
            />
            <span className="num w-6 text-right text-ink">{jobs}</span>
          </label>

          <button
            onClick={run}
            disabled={busy || (preset === "custom" && custom.length === 0)}
            className="rounded-md bg-canopy px-4 py-2 font-medium text-[#06241a] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Starting…" : "Run scenario"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
