import { ReactNode } from "react";

const BADGE_STYLES: Record<string, string> = {
  controlled: "border-sky-700 text-sky-400",
  declarative: "border-amber-700 text-amber-400",
  "open-ended": "border-fuchsia-700 text-fuchsia-400",
};

// Shared chrome for every trading-floor widget. The badge names which
// CopilotKit gen-UI pattern the panel demonstrates — say it out loud.
export function Panel({
  title,
  pattern,
  children,
  className = "",
}: {
  title: string;
  pattern: "controlled" | "declarative" | "open-ended";
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col rounded-lg border border-neutral-800 bg-neutral-950 ${className}`}
    >
      <header className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-300">
          {title}
        </h2>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] ${BADGE_STYLES[pattern]}`}
        >
          {pattern}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  );
}
