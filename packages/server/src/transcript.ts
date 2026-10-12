import type { Event, EventKind } from "@relay/shared";
import { broadcast, type Session } from "./sessions.js";
import { mirrorEvent } from "./persist.js";

type NewEvent = {
  kind: EventKind;
  by?: string;
  data: Record<string, unknown>;
};

// seq is per session and assigned only here, so every browser agrees on order.
// The Postgres write is fire-and-forget; correctness never depends on it.
export function appendEvent(session: Session, partial: NewEvent): Event {
  const event: Event = {
    seq: ++session.seq,
    ts: new Date().toISOString(),
    kind: partial.kind,
    by: partial.by,
    data: partial.data,
  };
  session.events.push(event);
  broadcast(session, { type: "agent_event", event });
  mirrorEvent(session, event);
  return event;
}
