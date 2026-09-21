"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Event } from "@relay/shared";

// Which events are genuinely new to this viewer, so only those animate in.
//
// History replay for a late joiner lands as one batch and must render
// instantly — watching two hundred rows animate would be a stutter, not a
// signal. A row that unmounts and comes back (a folded turn reopened) has
// already been seen and must not animate twice. So: everything present on
// the first non-empty render is "seen"; from then on an event is new exactly
// once, on the render where it first appears.

const Ctx = createContext<Set<number>>(new Set());

type Tracker = { seen: Set<number>; primed: boolean };

// Module-level rather than a ref: the render needs to *read* what has been
// seen, and a ref can't be read during render. Keyed by session so two
// sessions opened in one tab don't share a memory; written only from the
// effect below.
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

/** True for the whole life of this mount if the event was new when it mounted. */
export function useIsNew(seq: number): boolean {
  const fresh = useContext(Ctx);
  const [isNew] = useState(() => fresh.has(seq));
  return isNew;
}
