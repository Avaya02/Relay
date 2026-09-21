"use client";

import { useEffect, useState } from "react";
import type { SessionStatus } from "@relay/shared";

// SESSIONS YOU'VE BEEN IN, remembered per browser.
//
// Relay has no accounts, and shouldn't have: the product is a link you share
// with people you're already talking to (PRODUCT.md). But "no accounts" had a
// consequence nobody chose — close the tab and the session was gone unless
// you'd saved the URL somewhere. There was no way back to anything.
//
// localStorage is the honest fix for exactly this shape of problem. It is
// per-browser, needs no server-side identity, and stores only what this
// person already knows: sessions they personally joined. It is not a sync
// feature and doesn't pretend to be — another device shows a different list,
// which is the correct behaviour for something with no account behind it.
//
// Every access is wrapped: private windows, disabled site data, and iOS
// quota errors all throw on plain reads, and none of them should take down
// the session view.

const KEY = "relay.sessions.v1";
const LIMIT = 30;

export type RecentSession = {
  id: string;
  /** The name you joined as, so a shared browser isn't confusing. */
  name: string;
  repo: string | null;
  /**
   * The first instruction, clipped — what the session was *about*. Two
   * sessions on one repo are the normal case, and a list labelled only by
   * repo is a list of identical rows. Empty until someone drives.
   */
  title: string;
  firstSeen: number;
  lastSeen: number;
  /** Cached from the last time this browser had the session open. */
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
    // Defensive: this is data an older build of the app wrote, and a user can
    // edit it by hand. Anything malformed is dropped rather than rendered.
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

// In-tab subscribers. `storage` events only fire in *other* tabs, so a
// component in this one would never hear about its own writes without this.
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

/**
 * Reads on mount rather than during render: the server has no localStorage,
 * so rendering the list directly would produce markup the client can't match
 * and React would throw a hydration error. The empty first paint is correct.
 *
 * `now` comes back with the list rather than being read at render time. Two
 * reasons, and only the second one is obvious: `Date.now()` during render is
 * impure and React's lint rules reject it, and a fixed timestamp would leave
 * "just now" saying "just now" an hour later. It ticks once a minute, which
 * is the resolution the labels are written to.
 */
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
    // Another tab joining a session should show up here too.
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

/** "just now" / "14m" / "3h" / "2d" — compact enough for a 15rem rail. */
export function shortAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/**
 * Today / Yesterday / Earlier. Three buckets, not seven: a list this short
 * doesn't need a calendar, it needs to separate "what I was just doing" from
 * everything else.
 */
export function bucketOf(ts: number, now = Date.now()): string {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (ts >= startOfToday) return "Today";
  if (ts >= startOfToday - 86_400_000) return "Yesterday";
  return "Earlier";
}
