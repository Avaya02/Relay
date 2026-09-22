"use client";

import { useCallback, useSyncExternalStore } from "react";

// Per-browser preferences and per-tab drafts, read through
// useSyncExternalStore so the server snapshot is the empty default and the
// client's value replaces it after hydration — no effect, no mismatch.
//
// Every storage access is wrapped: private windows, disabled site data and
// iOS quota errors all throw on a plain read, and none of them should take
// down the session view.

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}

const STEPS_KEY = "relay.prefs.showSteps";

function readShowSteps(): boolean {
  try {
    return window.localStorage.getItem(STEPS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Whether finished turns keep their steps open. Off by default — the answer
 * leads and the record folds beneath it — but someone who came to watch the
 * agent work rather than to read what it said can flip it once and keep it.
 */
export function useShowSteps(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribe, readShowSteps, () => false);
  const set = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(STEPS_KEY, next ? "1" : "0");
    } catch {
      // Not persisted; nothing to notify either, since the read would miss it.
      return;
    }
    notify();
  }, []);
  return [value, set];
}

const draftKey = (sessionId: string) => `relay:draft:${sessionId}`;

// Storage can be blocked; the draft then lives here for as long as the tab
// does, which is the same lifetime sessionStorage would have given it.
const fallback = new Map<string, string>();

function readDraft(sessionId: string): string {
  try {
    return window.sessionStorage.getItem(draftKey(sessionId)) ?? fallback.get(sessionId) ?? "";
  } catch {
    return fallback.get(sessionId) ?? "";
  }
}

/**
 * The composer's text, kept per tab so a reconnect or an accidental reload
 * doesn't eat a half-written instruction. sessionStorage, like the identity:
 * a draft belongs to the tab that typed it.
 */
export function useDraft(sessionId: string): [string, (next: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readDraft(sessionId),
    () => "",
  );
  const set = useCallback(
    (next: string) => {
      fallback.set(sessionId, next);
      try {
        if (next) window.sessionStorage.setItem(draftKey(sessionId), next);
        else window.sessionStorage.removeItem(draftKey(sessionId));
      } catch {
        // The fallback map already has it.
      }
      notify();
    },
    [sessionId],
  );
  return [value, set];
}

const WIDTH_KEY = "relay.prefs.changesWidth";
export const CHANGES_WIDTH = { min: 240, max: 640, initial: 272 };

function readChangesWidth(): number {
  try {
    const n = Number(window.localStorage.getItem(WIDTH_KEY));
    if (!Number.isFinite(n) || n === 0) return CHANGES_WIDTH.initial;
    return Math.min(CHANGES_WIDTH.max, Math.max(CHANGES_WIDTH.min, n));
  } catch {
    return CHANGES_WIDTH.initial;
  }
}

/** The changes rail's width, dragged by the reader and remembered per browser. */
export function useChangesWidth(): [number, (px: number) => void] {
  const value = useSyncExternalStore(subscribe, readChangesWidth, () => CHANGES_WIDTH.initial);
  const set = useCallback((px: number) => {
    const clamped = Math.round(Math.min(CHANGES_WIDTH.max, Math.max(CHANGES_WIDTH.min, px)));
    try {
      window.localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {
      return;
    }
    notify();
  }, []);
  return [value, set];
}
