"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Event } from "@relay/shared";

// Only events new to this viewer animate: the first non-empty render (history
// replay) counts as seen, and a remounted row must not animate twice.
const Ctx = createContext<Set<number>>(new Set());

type Tracker = { seen: Set<number>; primed: boolean };

// Module-level because refs can't be read during render; keyed by session so
// two sessions in one tab don't share memory.
const trackers = new Map<string, Tracker>();

function trackerFor(key: string): Tracker {
  let t = trackers.get(key);
  if (!t) {
    t = { seen: new Set(), primed: false };
    trackers.set(key, t);
  }
  return t;
}

export function NewRowsProvider({
  storeKey,
  events,
  children,
}: {
  storeKey: string;
  events: Event[];
  children: ReactNode;
}) {
  const tracker = trackerFor(storeKey);

  const fresh = new Set<number>();
  if (tracker.primed) {
    for (const e of events) if (!tracker.seen.has(e.seq)) fresh.add(e.seq);
  }

  useEffect(() => {
    const t = trackerFor(storeKey);
    for (const e of events) t.seen.add(e.seq);
    if (events.length > 0) t.primed = true;
  });

  return <Ctx.Provider value={fresh}>{children}</Ctx.Provider>;
}

export function useIsNew(seq: number): boolean {
  const fresh = useContext(Ctx);
  const [isNew] = useState(() => fresh.has(seq));
  return isNew;
}
