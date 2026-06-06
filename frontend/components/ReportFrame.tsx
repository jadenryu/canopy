"use client";

import { Empty } from "./Empty";
import { Panel } from "./Panel";

// Open-ended gen-UI: the analyst agent authored ARBITRARY HTML/SVG — its
// own deliverable, drawn its own way — rendered verbatim in a sandboxed
// iframe (no scripts, no same-origin). The high-freedom end of the
// CopilotKit spectrum, on the same AG-UI connection as everything else.
// The agent is prompted to use a dark theme (#0a0a0a), so the frame stays dark.
export function ReportFrame({ html }: { html: string | null }) {
  return (
    <Panel
      title="Analyst report"
      subtitle={html ? "filed by analyst-agent" : undefined}
      pattern="open-ended"
      className="h-72"
    >
      {!html ? (
        <Empty glyph="✎" hint="agent-drawn HTML, sandboxed">
          the analyst files its report after the scenario…
        </Empty>
      ) : (
        <iframe
          sandbox=""
          srcDoc={html}
          title="agent-generated market report"
          className="h-full w-full animate-slide-in rounded-md border border-edge bg-black"
        />
      )}
    </Panel>
  );
}
