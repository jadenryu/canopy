// Shared empty state for every panel — the demo starts cold, then fills.
export function Empty({
  glyph = "◌",
  hint,
  children,
}: {
  glyph?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-16 flex-col items-center justify-center gap-1 py-4 text-center">
      <span className="text-lg text-edge-2">{glyph}</span>
      <span className="text-xs text-ink-faint">{children}</span>
      {hint && <span className="text-[10px] text-ink-faint/70">{hint}</span>}
    </div>
  );
}
