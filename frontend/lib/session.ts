"use client";

import { useEffect, useState } from "react";

// Lightweight client session — a display name that persists locally and
// personalizes the floor (the human client gets your name). Swappable for
// a real auth provider later without touching consumers.
export type Session = { name: string };

const KEY = "canopy:session";

export function useSession() {
  const [user, setUser] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
      /* corrupted session — start signed out */
    }
    setReady(true);
  }, []);

  const signIn = (name: string) => {
    const session = { name: name.trim() };
    localStorage.setItem(KEY, JSON.stringify(session));
    setUser(session);
  };

  const signOut = () => {
    localStorage.removeItem(KEY);
    setUser(null);
  };

  return { user, ready, signIn, signOut };
}
