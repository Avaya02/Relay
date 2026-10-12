"use client";

import { useCallback, useSyncExternalStore } from "react";

// useSyncExternalStore: the server snapshot is the default, so hydration doesn't
// mismatch. Every storage access is wrapped; private windows and iOS quota errors throw.
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

export function useShowSteps(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribe, readShowSteps, () => false);
  const set = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(STEPS_KEY, next ? "1" : "0");
    } catch {
      // Not persisted, so there is nothing to notify about.
      return;
    }
    notify();
  }, []);
  return [value, set];
}

const draftKey = (sessionId: string) => `relay:draft:${sessionId}`;

// Used when storage is blocked; lives as long as the tab, like sessionStorage.
const fallback = new Map<string, string>();

function readDraft(sessionId: string): string {
  try {
    return window.sessionStorage.getItem(draftKey(sessionId)) ?? fallback.get(sessionId) ?? "";
  } catch {
    return fallback.get(sessionId) ?? "";
  }
}

// Per tab (sessionStorage), like the identity.
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

const panelKey = (name: string) => `relay.prefs.panel.${name}`;

function readPanel(name: string): boolean {
  try {
    return window.localStorage.getItem(panelKey(name)) !== "0";
  } catch {
    return true;
  }
}

export function usePanel(name: "sessions" | "changes"): [boolean, (open: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => readPanel(name), () => true);
  const set = useCallback(
    (open: boolean) => {
      try {
        window.localStorage.setItem(panelKey(name), open ? "1" : "0");
      } catch {
        return;
      }
      notify();
    },
    [name],
  );
  return [value, set];
}
