"use client";

import { Panel } from "./Panel";

// Open-ended gen-UI: the analyst agent authored ARBITRARY HTML/SVG — its
// own deliverable, drawn its own way — rendered verbatim in a sandboxed
// iframe (no scripts, no same-origin). The high-freedom end of the
// CopilotKit spectrum, on the same AG-UI connection as everything else.
export function ReportFrame({ html }: { html: string | null }) {
  return (
    <Panel title="Analyst report (agent-drawn)" pattern="open-ended" className="h-72">
      {!html ? (
        <div className="py-4 text-center text-xs text-neutral-600">
          the analyst files its report after the scenario…
        </div>
      ) : (
        <iframe
          sandbox=""
          srcDoc={html}
          title="agent-generated market report"
          className="h-full w-full rounded border border-neutral-800 bg-black"
        />
      )}
    </Panel>
  );
}
