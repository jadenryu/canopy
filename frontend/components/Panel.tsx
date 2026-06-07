"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

// Click-to-learn: each badge opens the technical story of the gen-UI
// pattern this panel demonstrates — the CopilotKit spectrum, explained
// where it's actually happening.
const PATTERN_INFO: Record<string, { name: string; how: string }> = {
  controlled: {
    name: "Controlled generative UI",
    how: "A fixed React widget — the market only supplies data. The backend publishes state over one AG-UI connection (STATE_SNAPSHOT, then a JSON-Patch STATE_DELTA per market event); this panel is a pure projection of that shared state. High control: the UI shape is ours, the content is the market's.",
  },
  declarative: {
    name: "Declarative generative UI",
    how: "The backend streams a structured UI spec (stats / table / note JSON) and a generic renderer walks it. The schema is fixed; the agent decides the content and shape at runtime — shared control, the middle of CopilotKit's spectrum, on the same AG-UI connection.",
  },
  "open-ended": {
    name: "Open-ended generative UI",
    how: "An agent authors arbitrary HTML/SVG — its own deliverable, drawn its own way — rendered verbatim in a sandboxed iframe (no scripts, no same-origin). The high-freedom end of the spectrum, still on the same AG-UI connection.",
  },
};

function PatternBadge({ pattern }: { pattern: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const info = PATTERN_INFO[pattern];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        title="What does this gen-UI pattern mean?"
        className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
          open
            ? "border-canopy/50 text-canopy"
            : "border-edge text-ink-faint hover:border-edge-2 hover:text-ink-dim"
        }`}
      >
        {pattern}
      </button>
      {open && info && (
        <div className="absolute top-full right-0 z-40 mt-1.5 w-72 rounded-md border border-edge-2 bg-surface p-3 text-left shadow-xl shadow-black/20">
          <div className="mb-1 text-xs font-medium text-ink">{info.name}</div>
          <p className="text-[11px] leading-4.5 text-ink-dim">{info.how}</p>
          <p className="mt-1.5 border-t border-edge pt-1.5 text-[10px] text-ink-faint">
            One of CopilotKit&apos;s three gen-UI patterns — all three run on a
            single AG-UI connection in this app.
          </p>
        </div>
      )}
    </div>
  );
}

// Shared chrome for every widget. The pattern tag quietly records which
// CopilotKit gen-UI pattern the panel demonstrates (legend in the footer);
// click it for the technical story.
export function Panel({
  title,
  subtitle,
  pattern,
  accent = false,
  footer,
  children,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  pattern: "controlled" | "declarative" | "open-ended";
  accent?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col overflow-hidden rounded-lg border border-edge bg-surface ${
        accent ? "border-t-2 border-t-canopy" : ""
      } ${className}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="shrink-0 text-[13px] font-medium text-ink">{title}</h2>
          {subtitle && (
            <span className="truncate text-xs text-ink-faint">{subtitle}</span>
          )}
        </div>
        <PatternBadge pattern={pattern} />
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      {footer && (
        <div className="border-t border-edge px-4 py-2 text-[11px] text-ink-faint">
          {footer}
        </div>
      )}
    </section>
  );
}
