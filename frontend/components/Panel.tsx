import { ReactNode } from "react";

// Shared chrome for every widget. The pattern tag quietly records which
// CopilotKit gen-UI pattern the panel demonstrates (legend in the footer);
// it stays muted — the data is the interface, not the badges.
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
  subtitle?: string;
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
        <span className="shrink-0 rounded border border-edge px-1.5 py-0.5 text-[10px] text-ink-faint">
          {pattern}
        </span>
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
