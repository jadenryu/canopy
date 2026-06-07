"use client";

import {
  Activity,
  BarChart3,
  FlaskConical,
  Moon,
  Network,
  Sun,
  Swords,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useSession } from "@/lib/session";
import { control, runScenarioBody, useMarketState } from "@/lib/useMarketState";
import { FleetConfig } from "./FleetConfig";

// Light is the default; "dark" in localStorage flips the palette (the
// pre-paint script in layout.tsx applies it before hydration). Stateless:
// the icon swap is pure CSS (dark: variant), so there's nothing to hydrate.
function ThemeToggle() {
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("canopy-theme", next ? "dark" : "light");
    } catch {
      /* private mode etc. — toggle still works for the session */
    }
  };
  return (
    <button
      onClick={toggle}
      title="Toggle light/dark mode"
      className="rounded-md border border-edge p-1.5 text-ink-dim transition-colors hover:border-edge-2 hover:text-ink"
    >
      <Moon size={14} className="dark:hidden" />
      <Sun size={14} className="hidden dark:block" />
    </button>
  );
}

const NAV = [
  { href: "/", label: "Trading floor", icon: Activity },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/evaluations", label: "Evaluations", icon: BarChart3 },
  { href: "/benchmarks", label: "Benchmarks", icon: FlaskConical },
  { href: "/arena", label: "Arena", icon: Swords },
  { href: "/integrations", label: "Integrations", icon: Network },
];

// App shell — sidebar navigation, session, and global market controls.
// Children render client-side only (the mount gate), which eliminates the
// SSR-hydration mismatch class entirely for this live-data app.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, start, running } = useMarketState();
  const { user, ready, signIn, signOut } = useSession();
  const [configOpen, setConfigOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  // hydration gate without setState-in-effect: server snapshot false,
  // client snapshot true — flips exactly once at hydration
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // ONE auto-start for the whole app — pages must not start their own runs
  const watched = useRef(false);
  useEffect(() => {
    if (mounted && !watched.current) {
      watched.current = true;
      if (!running) start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const runConfigured = async (body: Record<string, unknown>) => {
    if (!running) start();
    await runScenarioBody(body);
  };

  const paused = state?.paused ?? false;

  return (
    <div className="flex min-h-screen bg-bg text-ink">
      {/* sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-52 flex-col border-r border-edge bg-surface">
        <Link href="/" className="flex items-center px-4 py-3">
          <Image
            src="/logo.png"
            alt="Canopy"
            width={132}
            height={132}
            priority
            className="h-12 w-auto rounded-md object-contain"
          />
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
                  active
                    ? "bg-surface-2 text-ink"
                    : "text-ink-dim hover:bg-surface-2/60 hover:text-ink"
                }`}
              >
                <Icon size={15} className={active ? "text-canopy" : ""} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* session */}
        <div className="border-t border-edge p-3 text-xs">
          {!ready ? null : user ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-ink">{user.name}</div>
                <div className="text-[10px] text-ink-faint">market client</div>
              </div>
              <button
                onClick={signOut}
                className="rounded-md border border-edge px-2 py-1 text-[11px] text-ink-dim hover:border-edge-2 hover:text-ink"
              >
                Sign out
              </button>
            </div>
          ) : signingIn ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (nameDraft.trim()) {
                  signIn(nameDraft);
                  setSigningIn(false);
                }
              }}
              className="flex flex-col gap-1.5"
            >
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Your name"
                className="rounded-md border border-edge bg-surface-2 px-2 py-1.5 text-xs placeholder:text-ink-faint focus:border-canopy focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-md bg-canopy px-2 py-1.5 text-[11px] font-medium text-[#06241a]"
              >
                Sign in
              </button>
            </form>
          ) : (
            <button
              onClick={() => setSigningIn(true)}
              className="w-full rounded-md border border-edge px-2 py-1.5 text-ink-dim hover:border-edge-2 hover:text-ink"
            >
              Sign in
            </button>
          )}
        </div>
      </aside>

      {/* content */}
      <div className="ml-52 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-edge bg-bg/90 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-2 text-xs">
            <span className="relative flex h-1.5 w-1.5">
              {running && !paused && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-canopy opacity-50" />
              )}
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                  paused ? "bg-working" : running ? "bg-canopy" : "bg-edge-2"
                }`}
              />
            </span>
            <span className="text-ink-dim">
              {paused ? "Paused" : running ? "Live" : "Disconnected"}
            </span>
            {!running && (
              <button
                onClick={() => start()}
                className="rounded-md border border-edge px-2 py-1 text-[11px] text-ink-dim hover:border-edge-2 hover:text-ink"
              >
                Reconnect
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <ThemeToggle />
            <button
              onClick={() => control.pause(!paused)}
              className={`rounded-md border px-3 py-1.5 transition-colors ${
                paused
                  ? "border-working/50 text-working hover:bg-working/10"
                  : "border-edge text-ink-dim hover:border-edge-2 hover:text-ink"
              }`}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={() => setConfigOpen(true)}
              className="rounded-md bg-canopy px-3.5 py-1.5 font-medium text-[#06241a] transition-opacity hover:opacity-90"
            >
              Run scenario
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1380px] flex-1 px-6 py-5">
          {mounted ? children : null}
        </main>
      </div>
      <FleetConfig
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        onRun={runConfigured}
      />
    </div>
  );
}
