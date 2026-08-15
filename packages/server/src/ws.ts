import { randomUUID } from "node:crypto";
import type { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage } from "@relay/shared";
import { getSession, sessionStateMessage, setStatus } from "./sessions.js";
import type { Session, SessionParticipant } from "./sessions.js";
import { broadcast } from "./sessions.js";
import { appendEvent } from "./transcript.js";
import { runAgent } from "./agent.js";
import { disposeWorkingDir, publishSession, sessionChanges } from "./repo.js";

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
    // Without this, a protocol-level error (e.g. an unmasked client frame)
    // emits 'error' on the socket, and an unhandled 'error' on an
    // EventEmitter throws — taking down the whole process and every other
    // session on it. terminate() forces 'close' to fire so the normal
    // participant-cleanup path still runs.
    socket.on("error", (err) => {
      console.error("socket error:", err instanceof Error ? err.message : err);
      socket.terminate();
    });

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

          if (participant.id !== session.driverId) {
            send(socket, {
              type: "error",
              message: "only the driver can send instructions",
            });
            return;
          }

          appendEvent(session, {
            kind: "user_instruction",
            by: participant.id,
            data: { text: msg.text },
          });

          // Never run two agents concurrently against the same working dir /
          // resumed conversation — the instruction still lands in the
          // transcript immediately (above), but the run itself waits until
          // the in-flight one settles. onRunSettled() drains this queue.
          if (session.status === "working") {
            session.instructionQueue.push(msg.text);
          } else {
            setStatus(session, "working");
            runAgent(session, msg.text);
          }
          break;
        }

        case "request_control": {
          const state = connections.get(socket);
          if (!state) return;
          const { session, participant } = state;

          if (session.driverId === null) {
            // Nobody's driving — nothing to grant, nothing to wait for.
            session.driverId = participant.id;
            broadcast(session, {
              type: "control_changed",
              driverId: participant.id,
            });
            return;
          }

          const driver = session.participants.get(session.driverId);
          if (driver) {
            send(driver.socket, {
              type: "control_requested",
              participantId: participant.id,
              displayName: participant.displayName,
            });
          }
          break;
        }

        case "hand_over": {
          const state = connections.get(socket);
          if (!state) return;
          const { session, participant } = state;

          if (participant.id !== session.driverId) {
            send(socket, {
              type: "error",
              message: "only the driver can hand over control",
            });
            return;
          }
          if (!session.participants.has(msg.toParticipantId)) return;

          session.driverId = msg.toParticipantId;
          broadcast(session, {
            type: "control_changed",
            driverId: session.driverId,
          });
          break;
        }

        case "request_changes": {
          const state = connections.get(socket);
          if (!state) return;
          const { session } = state;
          if (!session.workingDir) {
            send(socket, {
              type: "session_changes",
              files: [],
              insertions: 0,
              deletions: 0,
              patch: "",
            });
            return;
          }
          // Read-only, so any participant may ask — a viewer wanting to see
          // what the agent did is the normal case, not a privileged one.
          void sessionChanges(session.workingDir)
            .then((c) => send(socket, { type: "session_changes", ...c }))
            .catch((err) => {
              console.error("session_changes failed:", err);
              send(socket, { type: "error", message: "could not read session changes" });
            });
          break;
        }

        case "publish": {
          const state = connections.get(socket);
          if (!state) return;
          const { session, participant } = state;

          // Same guard shape as `instruct` — publishing writes to a branch and
          // possibly to GitHub, so it belongs to whoever holds the wheel.
          if (participant.id !== session.driverId) {
            send(socket, {
              type: "error",
              message: "only the driver can publish this session",
            });
            return;
          }
          if (!session.workingDir) {
            send(socket, {
              type: "publish_result",
              ok: false,
              error: "this session hasn't run anything yet",
            });
            return;
          }

          const title =
            typeof msg.title === "string" && msg.title.trim()
              ? msg.title.trim().slice(0, 120)
              : `Relay session ${session.id}`;

          void publishSession(session.workingDir, session.id, title)
            .then((r) => {
              // Broadcast: everyone watched the work, everyone should see
              // where it landed.
              broadcast(
                session,
                r.ok
                  ? {
                      type: "publish_result",
                      ok: true,
                      branch: r.branch,
                      pushed: r.pushed,
                      prUrl: r.prUrl,
                      note: r.note,
                    }
                  : { type: "publish_result", ok: false, error: r.error },
              );
            })
            .catch((err) => {
              console.error("publish failed:", err);
              send(socket, {
                type: "publish_result",
                ok: false,
                error: "publish failed",
              });
            });
          break;
        }

        case "release_control": {
          const state = connections.get(socket);
          if (!state) return;
          const { session, participant } = state;

          if (participant.id !== session.driverId) return;

          session.driverId = null;
          broadcast(session, { type: "control_changed", driverId: null });
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

      // A disconnected driver can't be handed a lock back, so free it rather
      // than leaving the session permanently stuck. No auto-reassignment to
      // another participant — same "nobody drives until someone claims it"
      // rule as an explicit release.
      if (session.driverId === participant.id) {
        session.driverId = null;
        broadcast(session, { type: "control_changed", driverId: null });
      }

      broadcast(session, { type: "participant_left", participant });
      for (const other of session.participants.values()) {
        send(other.socket, sessionStateMessage(session));
      }

      // Nobody left watching: stop the agent rather than let an abandoned
      // session keep spending API credit, and drop its working dir. The
      // session row itself stays so a quick refresh can still rejoin.
      if (session.participants.size === 0) {
        session.agentAbort?.abort();
        session.agentAbort = null;
        if (session.workingDir) {
          session.workingDir = null;
          session.agentSessionId = null;
          void disposeWorkingDir(session.id);
        }
      }
    });
  });
}
