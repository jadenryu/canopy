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

// semantic signal hues from globals.css (recharts needs raw hex)
const COLORS = [
  "#34d399",
  "#38bdf8",
  "#fbbf24",
  "#e879f9",
  "#a78bfa",
  "#f87171",
  "#a3e635",
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
    <Panel
      title="Clearing prices"
      subtitle="per (category, hops) — watch them converge"
      pattern="controlled"
      accent
      className="h-80"
    >
      {series.length === 0 ? (
        <Empty glyph="◠" hint="run a scenario ▶">
          no settlements yet
        </Empty>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -28 }}>
            <CartesianGrid stroke="#1d2622" strokeDasharray="3 3" />
            <XAxis
              dataKey="tick"
              tick={{ fontSize: 10, fill: "#56615c" }}
              stroke="#1d2622"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#56615c" }}
              stroke="#1d2622"
              domain={[0, "auto"]}
            />
            <Tooltip
              contentStyle={{
                background: "#0c100e",
                border: "1px solid #2c3a33",
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
                strokeWidth={2}
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
