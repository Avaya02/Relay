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
  // Null while disconnected but inside the reconnect grace window (see
  // scheduleParticipantGrace) — a dropped wifi connection shouldn't make a
  // participant vanish from presence or lose the driver's seat the instant
  // the socket closes.
  socket: WebSocket | null;
  // Lets a reconnecting client reattach to this exact identity instead of
  // minting a new participant. Only meaningful for the lifetime of the
  // process — never written to Postgres.
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
  // The SDK's own session id, so follow-up instructions resume the same agent
  // conversation instead of starting a fresh one each turn. Reported by the
  // runner; passed back to it on the next instruction.
  agentSessionId: string | null;
  // Instructions sent while a run is already in flight. Never run two agents
  // concurrently against the same working dir/resumed conversation — queue
  // instead and drain one at a time once the current run settles.
  instructionQueue: string[];
  // Set once nobody's connected. If it fires with the session still empty,
  // the in-memory record is dropped — otherwise a long-lived process
  // accumulates every session ever created, forever (see scheduleReap).
  reapTimer: NodeJS.Timeout | null;
  // The relayrun CLI for this session, if one is attached. It holds the
  // repo and runs the agent; without it nothing can execute an instruction.
  runnerSocket: WebSocket | null;
  // Proves a socket is allowed to be this session's runner. Minted here,
  // returned once by POST /sessions, and never written to Postgres. Durable
  // for the session's lifetime, so a restarted CLI can reattach rather than
  // being locked out.
  runnerToken: string;
  // Reported by the runner at hello. All four are display-only: the room needs
  // to know which codebase it's watching and whose credentials are paying.
  repoName: string | null;
  agentMode: "mock" | "real" | null;
  keySource: "oauth" | "api-key" | "mock" | null;
  keyHint: string | null;
  /** Reported by the runner at connect; null until one attaches. */
  model: string | null;
  // Proposed instructions from anyone in the room. Inert until the driver
  // promotes one, which is what keeps "one writer" true while still giving
  // watchers something to do.
  suggestions: Suggestion[];
};

// Bounded so a room full of people cannot grow this without limit. Small on
// purpose: a backlog longer than this is a conversation, not a queue.
export const MAX_SUGGESTIONS = 20;

const sessions = new Map<string, Session>();

// How long a dropped socket gets before we treat the participant as gone —
// long enough to survive a wifi blip plus the client's own backoff, short
// enough that a real departure still reads as prompt.
const GRACE_MS = 30_000;


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
  };
  sessions.set(id, session);
  // Upserted (not just created) on every later status/driver change too —
  // this first call is what guarantees the row exists before any Event can
  // reference it as a foreign key.
  mirrorSessionMeta(session);
  // A session starts out unused, and until now nothing ever retired one that
  // stayed that way: the reap was only ever scheduled when a participant left,
  // so a POST /sessions that nobody joined lived for the life of the process.
  // Cancelled the moment anyone joins or a runner attaches.
  scheduleReap(session);
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
// change, so nothing should assign `session.driverId` directly.
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

// What will run on the next instruction, and on whose credentials. Everything
// here is reported by the runner — the server has no agent, no repo and no
// credentials of its own to describe.
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

export function liveSessionCount(): number {
  return sessions.size;
}

// Nobody's connected. Give it REAP_MS in case someone's mid-reload, then drop
// the in-memory record — otherwise a long-running process holds every
// session (and its full event array) ever created for as long as it's up.
//
// An attached runner blocks the reap. Without that check, a host who starts
// `relayrun` and shares the link before anyone opens it loses the session
// ten minutes later: the CLI stays connected and still prints "waiting for
// instructions", but the id is gone from the map, so the link 404s and the
// runner's own reconnect is rejected as an invalid token. The terminal says
// one thing and the server means another.
export function scheduleReap(session: Session): void {
  cancelReap(session);
  session.reapTimer = setTimeout(() => {
    if (liveParticipantCount(session) > 0) return;
    if (session.runnerSocket) {
      // Still hosted, just unwatched. Check again later rather than pinning it
      // in memory forever — the runner may go away without a clean close.
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
