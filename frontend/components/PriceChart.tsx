"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Empty } from "./Empty";
import { Panel } from "./Panel";

// restrained series palette — one hue family + two neutrals, no rainbow
const COLORS = [
  "#10b981",
  "#5d9dd5",
  "#8f86d8",
  "#9aa3ae",
  "#34b27d",
  "#d2a23f",
  "#5f6772",
  "#b078c9",
];

// "film:h2" → "film · 2-hop" (the raw keys are Redis key suffixes)
function seriesLabel(key: string): string {
  const m = key.match(/^(.+):h(\d+)$/);
  return m ? `${m[1]} · ${m[2]}-hop` : key;
}

// Controlled gen-UI: clearing-price convergence per (category, hops).
export function PriceChart({ prices }: { prices: Record<string, number[]> }) {
  const series = Object.entries(prices)
    .filter(([, v]) => v.length > 0)
    .map(([k, v]) => [seriesLabel(k), v] as [string, number[]]);
  const maxLen = Math.max(0, ...series.map(([, v]) => v.length));
  const data = Array.from({ length: maxLen }, (_, i) => {
    const row: Record<string, number | null> = { tick: i + 1 };
    for (const [key, values] of series) row[key] = values[i] ?? null;
    return row;
  });

  return (
    <Panel
      title="Clearing prices"
      subtitle="settled price per category · convergence = competition working"
      pattern="controlled"
      className="h-80"
    >
      {series.length === 0 ? (
        <Empty hint="Prices appear as jobs settle.">No settlements yet</Empty>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -28 }}>
            <CartesianGrid stroke="#20252d" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="tick"
              tick={{ fontSize: 10, fill: "#5f6772" }}
              stroke="#20252d"
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#5f6772" }}
              stroke="#20252d"
              tickLine={false}
              domain={[0, "auto"]}
            />
            <Tooltip
              contentStyle={{
                background: "#101317",
                border: "1px solid #2e3540",
                borderRadius: 6,
                fontSize: 11,
              }}
            />
            <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 10 }} />
            {series.map(([key], i) => (
              <Line
                key={key}
                dataKey={key}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
