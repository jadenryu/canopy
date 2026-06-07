"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { Panel } from "@/components/Panel";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type Integrations = {
  redis: {
    role: string;
    connected: boolean;
    stats: Record<string, number>;
    primitives: Record<string, string>;
  };
  weave: { role: string; project_url: string; surfaces: Record<string, string> };
  copilotkit: {
    role: string;
    endpoint: string;
    wire: string;
    patterns: Record<string, string>;
    hitl: string;
  };
};

function StatGrid({ stats }: { stats: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Object.entries(stats).map(([k, v]) => (
        <div key={k} className="rounded-md border border-edge bg-surface-2/60 px-3 py-2">
          <div className="text-[10px] text-ink-faint">{k.replaceAll("_", " ")}</div>
          <div className="num text-lg text-ink">{v}</div>
        </div>
      ))}
    </div>
  );
}

function DefList({ items }: { items: Record<string, string> }) {
  return (
    <dl className="flex flex-col gap-2">
      {Object.entries(items).map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 border-l-2 border-edge pl-3">
          <dt className="num text-[11px] text-ink">{k}</dt>
          <dd className="text-[11px] text-ink-dim">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// The integrations are the architecture, not add-ons — live counters
// straight off the infrastructure, with the role each system plays.
export default function IntegrationsPage() {
  const [data, setData] = useState<Integrations | null>(null);

  useEffect(() => {
    const load = () =>
      fetch(`${BACKEND}/meta/integrations`)
        .then((r) => r.json())
        .then(setData)
        .catch(() => setData(null));
    load();
    const t = setInterval(load, 5000); // live counters
    return () => clearInterval(t);
  }, []);

  if (!data) {
    return (
      <p className="py-10 text-center text-xs text-ink-faint">
        Connecting to the backend…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Integrations</h1>
        <p className="max-w-2xl text-xs text-ink-faint">
          Canopy is built ON these systems, not beside them: Redis is the
          exchange, Weave is the referee and credit bureau, CopilotKit/AG-UI is
          the only wire between this dashboard and the market. Counters below
          are live.
        </p>
      </div>

      <Panel
        title="Redis — the exchange"
        subtitle={data.redis.connected ? "connected · counters refresh every 5s" : "disconnected"}
        pattern="controlled"
        accent
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-ink-dim">{data.redis.role}</p>
          <StatGrid stats={data.redis.stats} />
          <DefList items={data.redis.primitives} />
        </div>
      </Panel>

      <Panel title="W&B Weave — the referee" subtitle="every surface is load-bearing" pattern="controlled">
        <div className="flex flex-col gap-4">
          <p className="text-xs text-ink-dim">{data.weave.role}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(data.weave.surfaces).map(([name, url]) => (
              <a
                key={name}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-md border border-edge px-3 py-2 text-xs text-ink-dim transition-colors hover:border-edge-2 hover:text-ink"
              >
                {name} <ExternalLink size={12} className="shrink-0" />
              </a>
            ))}
          </div>
          <a
            href={data.weave.project_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-canopy hover:underline"
          >
            Open the full Weave project →
          </a>
        </div>
      </Panel>

      <Panel
        title="CopilotKit / AG-UI — the wire"
        subtitle={`${data.copilotkit.endpoint} · ${data.copilotkit.wire}`}
        pattern="controlled"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-ink-dim">{data.copilotkit.role}</p>
          <DefList items={data.copilotkit.patterns} />
          <p className="border-l-2 border-working/50 pl-3 text-[11px] text-ink-dim">
            Human-in-the-loop: {data.copilotkit.hitl}.
          </p>
        </div>
      </Panel>
    </div>
  );
}
