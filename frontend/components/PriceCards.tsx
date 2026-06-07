"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

import { Empty } from "./Empty";
import { Panel } from "./Panel";

// "film:h2" → {category: "film", hops: 2}
function parseKey(key: string): { label: string; hops: number } {
  const m = key.match(/^(.+):h(\d+)$/);
  return m ? { label: m[1], hops: Number(m[2]) } : { label: key, hops: 0 };
}

// One category's clearing-price history as a sparkline card. Small
// multiples beat a tangled multi-line chart: each market reads on its
// own, the trend (settling = competition working) is obvious, and the
// last/Δ numbers are right there.
function Card({
  name,
  series,
  onSelect,
}: {
  name: string;
  series: number[];
  onSelect?: (key: string) => void;
}) {
  const { label, hops } = parseKey(name);
  const data = series.map((v, i) => ({ i, v }));
  const last = series[series.length - 1];
  const first = series[0];
  const delta = last - first;
  const settled = series.length >= 3 && Math.abs(delta) / first < 0.12;

  return (
    <div
      onClick={() => onSelect?.(name)}
      className={`flex flex-col gap-1 rounded-md border border-edge bg-surface-2/30 p-2.5 transition-colors ${
        onSelect ? "cursor-pointer hover:border-edge-2 hover:bg-surface-2/60" : ""
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-ink">{label}</span>
        <span className="text-[10px] text-ink-faint">{hops}-hop</span>
      </div>
      <div className="h-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <YAxis hide domain={["dataMin - 0.3", "dataMax + 0.3"]} />
            <Area
              dataKey="v"
              stroke="var(--color-canopy)"
              strokeWidth={1.5}
              fill="var(--color-canopy)"
              fillOpacity={0.08}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="num text-sm text-ink">{last?.toFixed(2)}</span>
        <span
          className={`num text-[10px] ${
            settled ? "text-canopy" : delta > 0 ? "text-working" : "text-ink-faint"
          }`}
        >
          {settled ? "converged" : `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`}
        </span>
      </div>
    </div>
  );
}

// Clearing prices as small multiples — replaces the multi-line chart.
// Click a card for the category's full market detail.
export function PriceCards({
  prices,
  onSelectCategory,
}: {
  prices: Record<string, number[]>;
  onSelectCategory?: (key: string) => void;
}) {
  const series = Object.entries(prices).filter(([, v]) => v.length > 0);
  // sort: most-traded categories first
  series.sort((a, b) => b[1].length - a[1].length);

  return (
    <Panel
      title="Clearing prices"
      subtitle="per category — settling toward a clearing price = competition working · click a market"
      pattern="controlled"
      className="h-80"
    >
      {series.length === 0 ? (
        <Empty hint="Each category's price history appears as jobs settle.">
          No settlements yet
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {series.map(([name, v]) => (
            <Card key={name} name={name} series={v} onSelect={onSelectCategory} />
          ))}
        </div>
      )}
    </Panel>
  );
}
