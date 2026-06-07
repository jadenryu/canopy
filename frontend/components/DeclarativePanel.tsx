"use client";

import { SpecSection, UISpec } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

// Declarative (semi-open) gen-UI: the backend streams a STRUCTURED UI SPEC
// (panel/stats/table/note JSON) and this generic renderer walks it. The
// schema is fixed; the agent decides the content and shape at runtime —
// shared control, the middle of the CopilotKit spectrum.
function Section({ section }: { section: SpecSection }) {
  switch (section.type) {
    case "stats":
      return (
        <div className="flex flex-wrap gap-2">
          {section.items.map((s) => (
            <div
              key={s.label}
              className="rounded-md border border-edge bg-surface-2 px-2.5 py-1.5"
            >
              <div className="text-[10px] tracking-wider text-ink-faint uppercase">
                {s.label}
              </div>
              <div className="text-sm tabular-nums text-ink">{s.value}</div>
            </div>
          ))}
        </div>
      );
    case "table":
      return (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-ink-faint">
              {section.columns.map((c) => (
                <th key={c} className="pb-1 pr-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, i) => (
              <tr
                key={i}
                className={`border-t border-edge/60 ${
                  row.highlight ? "bg-positive/10 text-positive" : ""
                }`}
              >
                {row.cells.map((cell, j) => (
                  <td key={j} className="py-1 pr-2">
                    {cell}
                    {row.highlight && j === 0 ? " — selected" : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "note":
      return <p className="text-[11px] italic text-ink-faint">{section.text}</p>;
    default:
      return null;
  }
}

export function DeclarativePanel({ spec }: { spec: UISpec | null }) {
  return (
    <Panel title={spec?.title ?? "Job detail"} pattern="declarative" className="h-72">
      {!spec ? (
        <Empty hint="The backend streams a UI specification on first award.">
          No award yet
        </Empty>
      ) : (
        <div className="flex animate-slide-in flex-col gap-3">
          {spec.subtitle && (
            <p className="text-[11px] text-ink-dim">{spec.subtitle}</p>
          )}
          {spec.sections.map((s, i) => (
            <Section key={i} section={s} />
          ))}
        </div>
      )}
    </Panel>
  );
}
