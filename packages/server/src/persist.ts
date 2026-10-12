import type { Event, EventKind, SessionStatus } from "@relay/shared";
import { getPrisma } from "./db.js";
import type { Prisma } from "./generated/prisma/client.js";
import type { Session } from "./sessions.js";

// Writes are fire-and-forget: a DB failure must never block the live broadcast,
// and correctness never depends on Postgres. Called on every change; an upsert is cheap.
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

// Null for a missing row, a down database or no config alike: all mean "no session".
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
