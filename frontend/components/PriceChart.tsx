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

import { Panel } from "./Panel";

const COLORS = [
  "#22c55e",
  "#38bdf8",
  "#f59e0b",
  "#e879f9",
  "#f87171",
  "#a3e635",
  "#818cf8",
  "#2dd4bf",
];

// Controlled gen-UI: clearing-price convergence per (category, hops).
export function PriceChart({ prices }: { prices: Record<string, number[]> }) {
  const series = Object.entries(prices).filter(([, v]) => v.length > 0);
  const maxLen = Math.max(0, ...series.map(([, v]) => v.length));
  const data = Array.from({ length: maxLen }, (_, i) => {
    const row: Record<string, number | null> = { tick: i + 1 };
    for (const [key, values] of series) row[key] = values[i] ?? null;
    return row;
  });

  return (
    <Panel title="Clearing prices" pattern="controlled" className="h-72">
      {series.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-neutral-600">
          no settlements yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -28 }}>
            <CartesianGrid stroke="#262626" strokeDasharray="3 3" />
            <XAxis dataKey="tick" tick={{ fontSize: 10, fill: "#737373" }} />
            <YAxis tick={{ fontSize: 10, fill: "#737373" }} domain={[0, "auto"]} />
            <Tooltip
              contentStyle={{
                background: "#0a0a0a",
                border: "1px solid #404040",
                fontSize: 11,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {series.map(([key], i) => (
              <Line
                key={key}
                dataKey={key}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={1.5}
                dot={{ r: 2 }}
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
