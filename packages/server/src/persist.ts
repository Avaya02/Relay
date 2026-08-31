import type { Event, EventKind, SessionStatus } from "@relay/shared";
import { getPrisma } from "./db.js";
import type { Prisma } from "./generated/prisma/client.js";
import type { Session } from "./sessions.js";

// The Postgres mirror (spec §6.5). Two write paths, both fire-and-forget —
// a DB hiccup must never block or crash the live broadcast, which is why
// every call here is a .catch(), never an await, from the caller's side.
// One read path (loadPersistedSession), which IS awaited — it's the whole
// point of the read-only replay feature, not a side effect of it.

// Session.status / .driverId / .agentSessionId, mirrored on every change.
// Called far more often than strictly necessary (every setStatus, every
// setDriver) rather than tracked precisely — an upsert is cheap, and this
// guarantees the row always reflects reality without hunting down every
// mutation site by hand.
export function mirrorSessionMeta(session: Session): void {
  const prisma = getPrisma();
  if (!prisma) return;
  void prisma.session
    .upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        status: session.status,
        driverId: session.driverId,
        agentSessionId: session.agentSessionId,
      },
      update: {
        status: session.status,
        driverId: session.driverId,
        agentSessionId: session.agentSessionId,
      },
    })
    .catch((err) => console.error("persist: session upsert failed:", err));
}

// One row per transcript event. The Session row is always upserted before
// any event can exist for it (mirrorSessionMeta runs at session creation),
// so the FK is never a race in practice.
export function mirrorEvent(session: Session, event: Event): void {
  const prisma = getPrisma();
  if (!prisma) return;
  void prisma.event
    .create({
      data: {
        sessionId: session.id,
        seq: event.seq,
        ts: new Date(event.ts),
        kind: event.kind,
        by: event.by ?? null,
        data: event.data as Prisma.InputJsonValue,
      },
    })
    .catch((err) => console.error("persist: event mirror failed:", err));
}

export type PersistedSession = {
  status: SessionStatus;
  driverId: string | null;
  events: Event[];
};

// The dead-link path: a session that isn't live in memory (process
// restarted, or it was reaped after sitting empty — see sessions.ts) might
// still have a transcript worth reading. Returns null on anything short of
// "the row exists" — missing config, a down database, and "never existed"
// all look the same to the caller (spec's honest fallback: no session).
export async function loadPersistedSession(
  id: string,
): Promise<PersistedSession | null> {
  const prisma = getPrisma();
  if (!prisma) return null;

  try {
    const row = await prisma.session.findUnique({
      where: { id },
      include: { events: { orderBy: { seq: "asc" } } },
    });
    if (!row) return null;

    return {
      status: row.status as SessionStatus,
      driverId: row.driverId,
      events: row.events.map((e): Event => ({
        seq: e.seq,
        ts: e.ts.toISOString(),
        kind: e.kind as EventKind,
        by: e.by ?? undefined,
        data: e.data as Record<string, unknown>,
      })),
    };
  } catch (err) {
    console.error("persist: load failed:", err);
    return null;
  }
}
