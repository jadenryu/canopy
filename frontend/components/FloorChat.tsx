"use client";

import { useEffect, useRef } from "react";

import { ChatMessage } from "@/lib/useMarketState";
import { Empty } from "./Empty";
import { Panel } from "./Panel";

// initials avatar — deterministic tint per agent, no images
function tint(id: string): string {
  const hues = ["bg-info/20 text-info", "bg-verify/20 text-verify", "bg-canopy/20 text-canopy",
    "bg-working/20 text-working", "bg-special/20 text-special", "bg-positive/20 text-positive"];
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % hues.length;
  return hues[h];
}

function initials(label: string): string {
  return label.replace(/[^a-zA-Z0-9 ]/g, "").split(/[\s-]+/).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("") || "A";
}

// The floor chat — after each round, agents speak from their own memory
// (balance, record, latest lesson). The social layer over the economy:
// the leader gloats, the bankrupt signs off, the learner states a plan.
export function FloorChat({
  messages,
  onSelectAgent,
}: {
  messages: ChatMessage[];
  onSelectAgent: (id: string) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  return (
    <Panel
      title="Floor chat"
      subtitle="agents react after each round — from their own memory"
      pattern="controlled"
      className="h-72"
    >
      {messages.length === 0 ? (
        <Empty hint="After a round settles, each agent posts one line grounded in its balance, record and latest lesson.">
          Quiet between rounds
        </Empty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {messages.map((m, i) => (
            <button
              key={`${m.ts}-${i}`}
              onClick={() => onSelectAgent(m.agent_id)}
              className="flex animate-slide-in items-start gap-2 text-left"
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${tint(
                  m.agent_id
                )}`}
              >
                {initials(m.label)}
              </span>
              <div className="min-w-0">
                <span className="text-[11px] text-ink-dim">{m.label}</span>
                <p className="text-xs leading-4 text-ink">{m.text}</p>
              </div>
              <div ref={i === messages.length - 1 ? end : undefined} />
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}
