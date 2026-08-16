import type { Event, EventKind } from "@relay/shared";
import { broadcast, type Session } from "./sessions.js";
import { mirrorEvent } from "./persist.js";

type NewEvent = {
  kind: EventKind;
  by?: string;
  data: Record<string, unknown>;
};

// One function, called from everywhere an event is born (spec §6.5): stamps
// the next seq, pushes to the in-memory transcript, broadcasts it live, and
// mirrors it to Postgres. seq is assigned here and only here — this is the
// ordering guarantee that makes every connected browser agree on what
// happened when. The Postgres write is fire-and-forget (see persist.ts) —
// it can never be what a live session's correctness depends on.
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
