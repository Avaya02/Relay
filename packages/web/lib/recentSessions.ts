"use client";

import { useEffect, useState } from "react";
import type { SessionStatus } from "@relay/shared";

// Per-browser history in localStorage (there are no accounts, so no sync across
// devices). Every access is wrapped: private windows and iOS quota errors throw.
const KEY = "relay.sessions.v1";
const LIMIT = 30;

export type RecentSession = {
  id: string;
  name: string;
  repo: string | null;
  // First instruction, clipped, so sessions on one repo aren't identical rows.
  title: string;
  firstSeen: number;
  lastSeen: number;
  // Cached from the last time this browser had the session open.
  files: number;
  runs: number;
  costUsd: number;
  status: SessionStatus;
};

function read(): RecentSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Older builds or hand edits may have written this; drop anything malformed.
    return parsed.filter(
      (s): s is RecentSession =>
        !!s &&
        typeof s === "object" &&
        typeof (s as RecentSession).id === "string" &&
        typeof (s as RecentSession).lastSeen === "number",
    );
  } catch {
    return [];
  }
}

function write(list: RecentSession[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    // Full, disabled, or a private window. The app works without this.
  }
}

// `storage` events only fire in other tabs, so this tab needs its own subscribers.
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function rememberSession(
  patch: Partial<RecentSession> & { id: string },
): void {
  const now = Date.now();
  const list = read();
  const at = list.findIndex((s) => s.id === patch.id);
  const existing = at === -1 ? null : list[at];

  const next: RecentSession = {
    id: patch.id,
    name: patch.name ?? existing?.name ?? "",
    repo: patch.repo ?? existing?.repo ?? null,
    title: patch.title || existing?.title || "",
    firstSeen: existing?.firstSeen ?? now,
    lastSeen: now,
    files: patch.files ?? existing?.files ?? 0,
    runs: patch.runs ?? existing?.runs ?? 0,
    costUsd: patch.costUsd ?? existing?.costUsd ?? 0,
    status: patch.status ?? existing?.status ?? "idle",
  };

  if (at !== -1) list.splice(at, 1);
  list.unshift(next);
  write(list);
  emit();
}

export function forgetSession(id: string): void {
  write(read().filter((s) => s.id !== id));
  emit();
}

export function forgetAllSessions(): void {
  write([]);
  emit();
}

// Reads on mount to avoid a hydration mismatch (no localStorage on the server).
// `now` ticks here because Date.now() in render is impure and would go stale.
export function useRecentSessions(): {
  sessions: RecentSession[];
  now: number;
} {
  const [state, setState] = useState<{
    sessions: RecentSession[];
    now: number;
  }>({ sessions: [], now: 0 });

  useEffect(() => {
    const sync = () => setState({ sessions: read(), now: Date.now() });
    sync();
    listeners.add(sync);
    window.addEventListener("storage", sync);
    const tick = setInterval(sync, 60_000);
    return () => {
      listeners.delete(sync);
      window.removeEventListener("storage", sync);
      clearInterval(tick);
    };
  }, []);

  return state;
}

export function shortAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function bucketOf(ts: number, now = Date.now()): string {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (ts >= startOfToday) return "Today";
  if (ts >= startOfToday - 86_400_000) return "Yesterday";
  return "Earlier";
}
