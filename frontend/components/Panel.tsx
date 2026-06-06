import { ReactNode } from "react";

const BADGE_STYLES: Record<string, string> = {
  controlled: "bg-info/10 text-info border-info/30",
  declarative: "bg-working/10 text-working border-working/30",
  "open-ended": "bg-special/10 text-special border-special/30",
};

// Shared chrome for every trading-floor widget. The badge names which
// CopilotKit gen-UI pattern the panel demonstrates — say it out loud.
// `accent` puts a canopy-green top border on hero panels.
export function Panel({
  title,
  subtitle,
  pattern,
  accent = false,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  pattern: "controlled" | "declarative" | "open-ended";
  accent?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col overflow-hidden rounded-lg border border-edge bg-surface transition-colors duration-150 hover:border-edge-2 ${
        accent ? "border-t-2 border-t-canopy hover:border-t-canopy" : ""
      } ${className}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-edge bg-surface-2/50 px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-dim">
            {title}
          </h2>
          {subtitle && (
            <span className="truncate text-[10px] text-ink-faint">{subtitle}</span>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] lowercase ${BADGE_STYLES[pattern]}`}
        >
          {pattern}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  );
}
