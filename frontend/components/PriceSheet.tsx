"use client";

import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { STATUS } from "@/lib/status";
import { JobRow } from "@/lib/useMarketState";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-edge bg-surface-2/60 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={`num text-sm ${tone ?? "text-ink"}`}>{value}</div>
    </div>
  );
}

// One category-market, opened up: the full clearing-price history plus
// every job that traded in it — the technical detail behind a sparkline.
export function PriceSheet({
  priceKey,
  series,
  jobs,
  onClose,
  onSelectJob,
}: {
  priceKey: string | null;
  series: number[];
  jobs: JobRow[];
  onClose: () => void;
  onSelectJob: (id: string) => void;
}) {
  const m = priceKey?.match(/^(.+):h(\d+)$/);
  const category = m ? m[1] : (priceKey ?? "");
  const hops = m ? Number(m[2]) : 0;

  const traded = useMemo(
    () =>
      jobs
        .filter(
          (j) =>
            j.category === category &&
            (hops >= 3 ? j.hops >= 3 : j.hops < 3) &&
            j.price > 0
        )
        .reverse(),
    [jobs, category, hops]
  );

  const data = series.map((v, i) => ({ trade: i + 1, price: v }));
  const last = series[series.length - 1];
  const first = series[0];
  const delta = last - first;
  const settled = series.length >= 3 && Math.abs(delta) / first < 0.12;

  return (
    <Sheet open={priceKey !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-96 overflow-y-auto border-edge bg-surface sm:max-w-96">
        <SheetHeader className="pb-0">
          <SheetTitle className="text-ink">
            {category} <span className="text-ink-faint">· {hops}-hop market</span>
          </SheetTitle>
          <SheetDescription className="text-xs text-ink-dim">
            Clearing price = what this category settles at once competition
            stabilizes. Nobody sets it — it emerges from the bid book, weighted
            by reputation.
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-3 gap-2 px-4">
          <Stat label="last clear" value={last?.toFixed(2) ?? "—"} />
          <Stat
            label="session Δ"
            value={`${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`}
            tone={settled ? "text-canopy" : delta > 0 ? "text-working" : undefined}
          />
          <Stat label="trades" value={String(series.length)} />
        </div>

        <div className="h-36 px-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -28 }}>
              <XAxis
                dataKey="trade"
                tick={{ fontSize: 9, fill: "var(--ink-faint)" }}
                stroke="var(--edge)"
              />
              <YAxis
                tick={{ fontSize: 9, fill: "var(--ink-faint)" }}
                stroke="var(--edge)"
                domain={["dataMin - 0.3", "dataMax + 0.3"]}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--edge-2)",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "var(--ink)",
                }}
              />
              <Area
                dataKey="price"
                stroke="var(--color-canopy)"
                strokeWidth={1.5}
                fill="var(--color-canopy)"
                fillOpacity={0.08}
                dot={{ r: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="px-4 pb-6">
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-faint">
            trades in this market
          </div>
          <div className="flex flex-col gap-1">
            {traded.length === 0 ? (
              <p className="py-2 text-xs text-ink-faint">No priced jobs yet.</p>
            ) : (
              traded.slice(0, 12).map((j) => (
                <button
                  key={j.id}
                  onClick={() => onSelectJob(j.id)}
                  className="flex items-center gap-2 rounded-md border border-edge px-2.5 py-1.5 text-left text-[11px] transition-colors hover:border-edge-2 hover:bg-surface-2/60"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      STATUS[j.status]?.dot ?? "bg-edge-2"
                    }`}
                  />
                  <span className="text-ink-dim">{j.id}</span>
                  <span className="truncate text-ink-faint">
                    {j.winner_id ?? "—"}
                  </span>
                  <span className="num ml-auto shrink-0 text-ink">
                    {j.price.toFixed(2)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
