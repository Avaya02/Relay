import { randomUUID } from "node:crypto";
import type { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage } from "@relay/shared";
import { getSession, sessionStateMessage, setStatus } from "./sessions.js";
import type { Session, SessionParticipant } from "./sessions.js";
import { broadcast } from "./sessions.js";
import { appendEvent } from "./transcript.js";
import { runMockAgent } from "./agent.js";

type ConnectionState = {
  session: Session;
  participant: SessionParticipant;
};

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

export function attachWs(wss: WebSocketServer): void {
  // Tracks which session/participant a given socket belongs to, once joined.
  const connections = new Map<WebSocket, ConnectionState>();

  wss.on("connection", (socket) => {
    socket.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case "ping": {
          send(socket, { type: "pong" });
          break;
        }

        case "join": {
          const session = getSession(msg.sessionId);
          if (!session) {
            send(socket, {
              type: "error",
              message: `no session "${msg.sessionId}"`,
            });
            return;
          }

          const participant: SessionParticipant = {
            id: randomUUID(),
            displayName: msg.displayName,
            socket,
          };
          session.participants.set(participant.id, participant);
          connections.set(socket, { session, participant });

          // First joiner becomes driver (spec §6.2). Enforcing the lock on
          // `instruct` and the request/hand-over flow are Phase 3 — for now
          // this is just bookkeeping so session_state reports someone.
          if (session.driverId === null) {
            session.driverId = participant.id;
          }

          send(socket, { type: "joined", participantId: participant.id });
          send(socket, { type: "history", events: session.events });
          send(socket, sessionStateMessage(session));

          broadcast(session, { type: "participant_joined", participant });
          for (const other of session.participants.values()) {
            if (other.id !== participant.id) {
              send(other.socket, sessionStateMessage(session));
            }
          }
          break;
        }

        case "instruct": {
          const state = connections.get(socket);
          if (!state) {
            send(socket, { type: "error", message: "join a session first" });
            return;
          }
          const { session, participant } = state;

          appendEvent(session, {
            kind: "user_instruction",
            by: participant.id,
            data: { text: msg.text },
          });
          setStatus(session, "working");
          runMockAgent(session, msg.text);
          break;
        }
      }
    });

    socket.on("close", () => {
      const state = connections.get(socket);
      if (!state) return;
      connections.delete(socket);

      const { session, participant } = state;
      session.participants.delete(participant.id);
      broadcast(session, { type: "participant_left", participant });
      for (const other of session.participants.values()) {
        send(other.socket, sessionStateMessage(session));
      }
      // Driver reassignment on disconnect and session teardown (spec §6.2)
      // are Phase 3 concerns — the fixed demo session just stays alive.
    });
  });
}
