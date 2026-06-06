"use client";

import { SpecSection, UISpec } from "@/lib/useMarketState";
import { Panel } from "./Panel";

// Declarative (semi-open) gen-UI: the backend streams a STRUCTURED UI SPEC
// (panel/stats/table/note JSON) and this generic renderer walks it. The
// schema is fixed; the agent decides the content and shape at runtime —
// shared control, the middle of the CopilotKit spectrum.
function Section({ section }: { section: SpecSection }) {
  switch (section.type) {
    case "stats":
      return (
        <div className="flex flex-wrap gap-3">
          {section.items.map((s) => (
            <div key={s.label} className="rounded border border-neutral-800 px-2 py-1">
              <div className="text-[10px] uppercase text-neutral-500">{s.label}</div>
              <div className="text-xs">{s.value}</div>
            </div>
          ))}
        </div>
      );
    case "table":
      return (
        <table className="w-full text-left text-xs">
          <thead className="text-neutral-500">
            <tr>
              {section.columns.map((c) => (
                <th key={c} className="pb-1 pr-2">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, i) => (
              <tr
                key={i}
                className={`border-t border-neutral-900 ${
                  row.highlight ? "bg-green-950/60 text-green-300" : ""
                }`}
              >
                {row.cells.map((cell, j) => (
                  <td key={j} className="py-1 pr-2">
                    {cell}
                    {row.highlight && j === 0 ? " 🏆" : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "note":
      return <p className="text-[11px] italic text-neutral-500">{section.text}</p>;
    default:
      return null;
  }
}

export function DeclarativePanel({ spec }: { spec: UISpec | null }) {
  return (
    <Panel title={spec?.title ?? "Job detail"} pattern="declarative" className="h-72">
      {!spec ? (
        <div className="py-4 text-center text-xs text-neutral-600">
          awaiting first award…
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {spec.subtitle && (
            <p className="text-[11px] text-neutral-400">{spec.subtitle}</p>
          )}
          {spec.sections.map((s, i) => (
            <Section key={i} section={s} />
          ))}
        </div>
      )}
    </Panel>
  );
}
