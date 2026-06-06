"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { fetchModelCatalog, ORModel } from "@/lib/openrouter";

// Searchable OpenRouter model picker, dependency-free. Single- or
// multi-select; selected models render as removable chips.
export function ModelPicker({
  selected,
  onChange,
  multi = false,
  placeholder = "search models…",
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  multi?: boolean;
  placeholder?: string;
}) {
  const [models, setModels] = useState<ORModel[]>([]);
  const [live, setLive] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let on = true;
    fetchModelCatalog().then(({ models, live }) => {
      if (on) {
        setModels(models);
        setLive(live);
      }
    });
    return () => {
      on = false;
    };
  }, []);

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const hits = useMemo(() => {
    const q = query.toLowerCase().trim();
    const pool = q
      ? models.filter(
          (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
        )
      : models;
    return pool.slice(0, 8);
  }, [models, query]);

  const pick = (id: string) => {
    if (multi) {
      onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    } else {
      onChange([id]);
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={box} className="relative flex flex-col gap-1.5 text-xs">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <button
              key={id}
              onClick={() => onChange(selected.filter((s) => s !== id))}
              title="remove"
              className="flex items-center gap-1 rounded-full border border-canopy/40 bg-canopy/10 px-2 py-0.5 text-[10px] text-canopy transition-colors hover:border-negative/40 hover:bg-negative/10 hover:text-negative"
            >
              {id} ✕
            </button>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 placeholder:text-ink-faint focus:border-canopy focus:outline-none"
      />
      {open && hits.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border border-edge-2 bg-surface shadow-xl shadow-black/50">
          {hits.map((m) => {
            const on = selected.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => pick(m.id)}
                className={`flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2 ${
                  on ? "text-canopy" : "text-ink"
                }`}
              >
                <span className="truncate">{m.id}</span>
                <span className="ml-auto shrink-0 text-[10px] text-ink-faint">
                  {on ? "✓" : (m.context ? `${Math.round(m.context / 1000)}k ctx` : "")}
                </span>
              </button>
            );
          })}
          <div className="border-t border-edge px-2.5 py-1 text-[9px] text-ink-faint">
            {live ? "live OpenRouter catalog" : "curated list (catalog unreachable)"}
          </div>
        </div>
      )}
    </div>
  );
}
