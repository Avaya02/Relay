import { customAlphabet } from "nanoid";
import type { WebSocket } from "ws";
import type {
  Event,
  Participant,
  ServerMessage,
  SessionStatus,
} from "@relay/shared";

export type SessionParticipant = Participant & { socket: WebSocket };

export type Session = {
  id: string;
  status: SessionStatus;
  driverId: string | null;
  participants: Map<string, SessionParticipant>;
  events: Event[];
  seq: number;
};

const sessions = new Map<string, Session>();

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
  };
  sessions.set(id, session);
  return session;
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
// and presence change goes through this.
export function broadcast(session: Session, message: ServerMessage): void {
  const raw = JSON.stringify(message);
  for (const participant of session.participants.values()) {
    participant.socket.send(raw);
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
}
