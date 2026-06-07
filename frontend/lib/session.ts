"use client";

import { useMemo, useSyncExternalStore } from "react";

// Lightweight client session — a display name that persists locally and
// personalizes the floor (the human client gets your name). Swappable for
// a real auth provider later without touching consumers.
// localStorage is the external store, so we read it with
// useSyncExternalStore: hydration-safe (server snapshot = null), no
// setState-in-effect, and cross-tab sign-ins propagate via `storage`.
export type Session = { name: string };

const KEY = "canopy:session";

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

// snapshot is the raw string — a stable primitive, parsed in useMemo below
function getSnapshot(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function useSession() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const user = useMemo<Session | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null; /* corrupted session — start signed out */
    }
  }, [raw]);

  const signIn = (name: string) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ name: name.trim() }));
    } catch {
      /* private mode — session lasts until reload */
    }
    emit();
  };

  const signOut = () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    emit();
  };

  // ready is immediate with useSyncExternalStore (server renders signed-out,
  // the client snapshot takes over at hydration); kept for API compatibility.
  return { user, ready: true, signIn, signOut };
}
