// Shared empty state — quiet and precise, no decoration.
export function Empty({
  hint,
  children,
}: {
  glyph?: string; // accepted for compatibility; intentionally unused
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-16 flex-col items-center justify-center gap-1 py-6 text-center">
      <span className="text-[13px] text-ink-dim">{children}</span>
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </div>
  );
}
