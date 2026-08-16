import { customAlphabet } from "nanoid";
import type { WebSocket } from "ws";
import type {
  Event,
  Participant,
  ServerMessage,
  SessionStatus,
} from "@relay/shared";
import { mirrorSessionMeta } from "./persist.js";

export type SessionParticipant = Participant & {
  // Null while disconnected but inside the reconnect grace window (see
  // scheduleParticipantGrace) — a dropped wifi connection shouldn't make a
  // participant vanish from presence or lose the driver's seat the instant
  // the socket closes.
  socket: WebSocket | null;
  // Lets a reconnecting client reattach to this exact identity instead of
  // minting a new participant (spec C2/C1). Only meaningful for the lifetime
  // of the process — never written to Postgres.
  token: string;
  graceTimer: NodeJS.Timeout | null;
};

export type Session = {
  id: string;
  status: SessionStatus;
  driverId: string | null;
  participants: Map<string, SessionParticipant>;
  events: Event[];
  seq: number;
  // The demo-repo checkout this session's agent works in (spec §6.2/§6.6).
  // Prepared lazily on first instruct — creating a session shouldn't pay for
  // a clone nobody uses.
  workingDir: string | null;
  // Lets us stop an in-flight agent run (disconnect, teardown).
  agentAbort: AbortController | null;
  // The SDK's own session id, so follow-up instructions resume the same agent
  // conversation instead of starting a fresh one each turn.
  agentSessionId: string | null;
  // Instructions sent while a run is already in flight. Never run two agents
  // concurrently against the same working dir/resumed conversation — queue
  // instead and drain one at a time once the current run settles.
  instructionQueue: string[];
  // Set once nobody's connected. If it fires with the session still empty,
  // the in-memory record is dropped — otherwise a long-lived process
  // accumulates every session ever created, forever (see scheduleReap).
  reapTimer: NodeJS.Timeout | null;
};

const sessions = new Map<string, Session>();

// How long a dropped socket gets before we treat the participant as gone —
// long enough to survive a wifi blip plus the client's own backoff, short
// enough that a real departure still reads as prompt.
const GRACE_MS = 30_000;

// How long an empty session stays resident in memory before its record is
// dropped. Generous — someone might refresh a tab — but bounded, because
// nothing else here ever removes a Session.
const REAP_MS = 10 * 60_000;

// Unambiguous alphabet (no 0/O/1/I/l) — these ids get read aloud and typed
// when sharing a session link.
const nextId = customAlphabet(
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz",
  10,
);

function createSession(id: string): Session {
  const session: Session = {
    id,
    status: "idle",
    driverId: null,
    participants: new Map(),
    events: [],
    seq: 0,
    workingDir: null,
    agentAbort: null,
    agentSessionId: null,
    instructionQueue: [],
    reapTimer: null,
  };
  sessions.set(id, session);
  // Upserted (not just created) on every later status/driver change too —
  // this first call is what guarantees the row exists before any Event can
  // reference it as a foreign key.
  mirrorSessionMeta(session);
  return session;
}

// Not just "in the map" — during the reconnect grace window a participant
// stays in the map with `socket: null` so presence doesn't flicker. This is
// the actual "is anyone here" check: last-disconnect teardown, the abort of
// an abandoned run, and reaping all key off it, not off map size.
export function liveParticipantCount(session: Session): number {
  let n = 0;
  for (const p of session.participants.values()) if (p.socket) n++;
  return n;
}

export function findParticipantByToken(
  session: Session,
  token: string,
): SessionParticipant | undefined {
  for (const p of session.participants.values()) {
    if (p.token === token) return p;
  }
  return undefined;
}

// Centralizes driver changes the way setStatus already centralizes status —
// both are Session fields that need to reach Postgres (persist.ts) on every
// change, not just be assigned inline at each of the half-dozen call sites
// that used to set `session.driverId` directly.
export function setDriver(session: Session, driverId: string | null): void {
  session.driverId = driverId;
  mirrorSessionMeta(session);
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

// Phase 2: POST /sessions calls this to mint a real, shareable session.
export function createNewSession(): Session {
  return createSession(nextId());
}

// The one fixed session from Phase 1, kept around for quick manual testing —
// POST /sessions (above) is the real path now.
export function bootstrapDemoSession(): Session {
  return getSession("demo") ?? createSession("demo");
}

// The heart of "live for everyone" (spec §6.3): every agent_event, status,
// and presence change goes through this. Participants mid-grace (socket:
// null) are skipped — there's nothing to send to yet, and they'll catch up
// via `history` on reconnect same as any late joiner.
export function broadcast(session: Session, message: ServerMessage): void {
  const raw = JSON.stringify(message);
  for (const participant of session.participants.values()) {
    participant.socket?.send(raw);
  }
}

export function sessionStateMessage(session: Session): ServerMessage {
  return {
    type: "session_state",
    participants: Array.from(session.participants.values()).map((p) => ({
      id: p.id,
      displayName: p.displayName,
    })),
    driverId: session.driverId,
    status: session.status,
  };
}

export function setStatus(session: Session, status: SessionStatus): void {
  session.status = status;
  broadcast(session, { type: "status", status });
  mirrorSessionMeta(session);
}

// Start the grace window for a socket that just closed. `onExpire` is owned
// by the caller (ws.ts) because finishing a disconnect means broadcasting,
// possibly aborting the agent, and disposing the working dir — none of which
// belongs in this file's plain data helpers.
export function scheduleParticipantGrace(
  participant: SessionParticipant,
  onExpire: () => void,
): void {
  participant.graceTimer = setTimeout(onExpire, GRACE_MS);
}

// A reconnect landed before the grace window ran out — cancel it.
export function cancelParticipantGrace(participant: SessionParticipant): void {
  if (participant.graceTimer) {
    clearTimeout(participant.graceTimer);
    participant.graceTimer = null;
  }
}

// Nobody's connected. Give it REAP_MS in case someone's mid-reload, then drop
// the in-memory record — otherwise a long-running process holds every
// session (and its full event array) ever created for as long as it's up.
export function scheduleReap(session: Session): void {
  cancelReap(session);
  session.reapTimer = setTimeout(() => {
    if (liveParticipantCount(session) === 0) sessions.delete(session.id);
  }, REAP_MS);
}

export function cancelReap(session: Session): void {
  if (session.reapTimer) {
    clearTimeout(session.reapTimer);
    session.reapTimer = null;
  }
}
