import { randomUUID } from "node:crypto";
import { customAlphabet } from "nanoid";
import type { WebSocket } from "ws";
import type {
  AgentInfo,
  Event,
  Participant,
  ServerMessage,
  SessionStatus,
  Suggestion,
} from "@relay/shared";
import { mirrorSessionMeta } from "./persist.js";
import { REAP_MS } from "./config.js";

export type SessionParticipant = Participant & {
  // Null during the reconnect grace window, so a wifi blip keeps presence and the driver seat.
  socket: WebSocket | null;
  // Lets a reconnect reclaim this identity. In-memory only, never written to Postgres.
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
  // Lets follow-up instructions resume the same agent conversation.
  agentSessionId: string | null;
  // Instructions that arrive mid-run wait here, so two runs never share a working dir.
  instructionQueue: string[];
  reapTimer: NodeJS.Timeout | null;
  runnerSocket: WebSocket | null;
  // Never written to Postgres; lives as long as the session so a restarted CLI can reattach.
  runnerToken: string;
  // Reported by the runner; display-only.
  repoName: string | null;
  agentMode: "mock" | "real" | null;
  keySource: "oauth" | "api-key" | "mock" | null;
  keyHint: string | null;
  model: string | null;
  // Inert until the driver promotes one, so "one writer" still holds.
  suggestions: Suggestion[];
  // The runner reports a stop without knowing who asked; null when the room emptied.
  stoppedBy: string | null;
};

export const MAX_SUGGESTIONS = 20;

const sessions = new Map<string, Session>();

// Long enough to outlast a wifi blip plus the client's backoff.
const GRACE_MS = 30_000;

// No 0/O/1/I/l: ids get read aloud and typed.
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
    agentSessionId: null,
    instructionQueue: [],
    reapTimer: null,
    runnerSocket: null,
    runnerToken: randomUUID(),
    repoName: null,
    agentMode: null,
    keySource: null,
    keyHint: null,
    model: null,
    suggestions: [],
    stoppedBy: null,
  };
  sessions.set(id, session);
  // Must run first: events reference the session row as a foreign key.
  mirrorSessionMeta(session);
  // Otherwise a POST /sessions nobody joins would never be reaped.
  scheduleReap(session);
  return session;
}

// Not map size: participants in the grace window stay in the map with a null socket.
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

// Always go through this so every driver change is mirrored to Postgres.
export function setDriver(session: Session, driverId: string | null): void {
  session.driverId = driverId;
  mirrorSessionMeta(session);
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function createNewSession(): Session {
  return createSession(nextId());
}

export function bootstrapDemoSession(): Session {
  return getSession("demo") ?? createSession("demo");
}

// Participants mid-grace (null socket) are skipped; they catch up via `history` on reconnect.
export function broadcast(session: Session, message: ServerMessage): void {
  const raw = JSON.stringify(message);
  for (const participant of session.participants.values()) {
    participant.socket?.send(raw);
  }
}

// All runner-reported: the server has no agent, repo or credentials of its own.
export function agentInfo(session: Session): AgentInfo {
  return {
    mode: session.agentMode ?? "mock",
    keySource: session.keySource ?? "mock",
    keyHint: session.keyHint,
    model: session.model,
    runnerConnected: session.runnerSocket !== null,
  };
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
    repo: session.repoName,
    agent: agentInfo(session),
  };
}

export function setStatus(session: Session, status: SessionStatus): void {
  session.status = status;
  broadcast(session, { type: "status", status });
  mirrorSessionMeta(session);
}

export function scheduleParticipantGrace(
  participant: SessionParticipant,
  onExpire: () => void,
): void {
  participant.graceTimer = setTimeout(onExpire, GRACE_MS);
}

export function cancelParticipantGrace(participant: SessionParticipant): void {
  if (participant.graceTimer) {
    clearTimeout(participant.graceTimer);
    participant.graceTimer = null;
  }
}

export function liveSessionCount(): number {
  return sessions.size;
}

// Drops the in-memory session after REAP_MS unwatched, so the process doesn't
// hold every session's events forever.
export function scheduleReap(session: Session): void {
  cancelReap(session);
  session.reapTimer = setTimeout(() => {
    if (liveParticipantCount(session) > 0) return;
    if (session.runnerSocket) {
      // An attached runner blocks the reap, or a host who shares the link before
      // anyone opens it loses the session (404, runner rejected). Recheck later.
      scheduleReap(session);
      return;
    }
    sessions.delete(session.id);
  }, REAP_MS);
}

export function cancelReap(session: Session): void {
  if (session.reapTimer) {
    clearTimeout(session.reapTimer);
    session.reapTimer = null;
  }
}
