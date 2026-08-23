import { randomUUID } from "node:crypto";
import type { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, JoinMessage, ServerMessage } from "@relay/shared";
import {
  byoKeysAllowed,
  cancelParticipantGrace,
  cancelReap,
  clearSessionKey,
  findParticipantByToken,
  getSession,
  liveParticipantCount,
  scheduleParticipantGrace,
  scheduleReap,
  sessionStateMessage,
  setDriver,
  setStatus,
} from "./sessions.js";
import * as validate from "./validate.js";
import { verifyApiKey } from "./sessionKey.js";
import type { Session, SessionParticipant } from "./sessions.js";
import { broadcast } from "./sessions.js";
import { appendEvent } from "./transcript.js";
import { runAgent } from "./agent.js";
import { disposeWorkingDir, publishSession, sessionChanges } from "./repo.js";
import { loadPersistedSession } from "./persist.js";

type ConnectionState = {
  session: Session;
  participant: SessionParticipant;
};

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

// Standard `ws` liveness pattern: a half-open TCP connection (laptop lid,
// NAT timeout, a proxy that silently drops idle sockets) never fires 'close'
// on its own — without this it leaves a phantom participant in presence
// forever. A WeakMap instead of a socket property keeps the bookkeeping out
// of the `ws` instance itself.
const HEARTBEAT_MS = 30_000;

export function attachWs(wss: WebSocketServer): void {
  // Tracks which session/participant a given socket belongs to, once joined.
  const connections = new Map<WebSocket, ConnectionState>();
  const alive = new WeakMap<WebSocket, boolean>();

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.get(socket) === false) {
        socket.terminate(); // no pong since the last tick — presumed dead
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, HEARTBEAT_MS);
  wss.on("close", () => clearInterval(heartbeat));

  // Grace-window teardown, run once a disconnected participant's timer
  // actually expires without a reconnect claiming it (see the `join` handler
  // below and sessions.ts's scheduleParticipantGrace). Everything that used
  // to run synchronously in the 'close' handler now runs here instead.
  function finalizeDisconnect(
    session: Session,
    participant: SessionParticipant,
  ): void {
    session.participants.delete(participant.id);

    // Their key goes with them. Someone who supplied credentials and then
    // left the room should not keep being billed for whatever the people
    // still in it decide to run — and this is past the 30s grace window, so
    // it isn't triggered by a wifi blip.
    if (session.apiKeyOwner === participant.id) clearSessionKey(session);

    // A disconnected driver can't be handed a lock back, so free it rather
    // than leaving the session permanently stuck. No auto-reassignment to
    // another participant — same "nobody drives until someone claims it"
    // rule as an explicit release.
    if (session.driverId === participant.id) {
      setDriver(session, null);
      broadcast(session, { type: "control_changed", driverId: null });
    }

    broadcast(session, { type: "participant_left", participant });
    for (const other of session.participants.values()) {
      if (other.socket) send(other.socket, sessionStateMessage(session));
    }

    // Nobody left watching: stop the agent rather than let an abandoned
    // session keep spending API credit, and drop its working dir. The
    // session row itself stays (briefly — see scheduleReap) so a quick
    // refresh can still rejoin.
    if (liveParticipantCount(session) === 0) {
      session.agentAbort?.abort();
      session.agentAbort = null;
      session.instructionQueue.length = 0;
      if (session.workingDir) {
        session.workingDir = null;
        session.agentSessionId = null;
        void disposeWorkingDir(session.id);
      }
      scheduleReap(session);
    }
  }

  // Whichever way a socket disconnects (clean close, terminate() from the
  // heartbeat, or the error handler below), the accounting is identical —
  // everything funnels through here rather than duplicating cleanup per path.
  function handleDisconnect(socket: WebSocket): void {
    const state = connections.get(socket);
    if (!state) return;
    connections.delete(socket);

    const { session, participant } = state;
    // A reconnect may already have taken over this participant (new socket
    // attached, this one's close arriving late) — don't clobber it.
    if (participant.socket !== socket) return;
    participant.socket = null;

    scheduleParticipantGrace(participant, () =>
      finalizeDisconnect(session, participant),
    );
  }

  // `join` is the one message handler that needs to be async — reattaching
  // after a reconnect is synchronous, but a session that isn't live might
  // still exist in Postgres, and that lookup is the read-only-replay path.
  async function handleJoin(socket: WebSocket, msg: JoinMessage): Promise<void> {
    if (connections.has(socket)) {
      // Same guard C2 was missing: without it, a second `join` on one socket
      // mints a second participant and silently orphans the first — the
      // first becomes unreachable (connections is keyed by socket) and only
      // the second is ever cleaned up on close.
      send(socket, { type: "error", message: "already joined a session" });
      return;
    }

    // Checked before the session lookup: a bad name is the client's mistake
    // either way, and there's no reason to touch Postgres to tell them so.
    const name = validate.displayName(msg.displayName);
    if (!name.ok) {
      send(socket, { type: "error", message: name.error });
      return;
    }

    const session = getSession(msg.sessionId);
    if (!session) {
      const persisted = await loadPersistedSession(msg.sessionId);
      if (persisted) {
        send(socket, {
          type: "replay",
          status: persisted.status,
          driverId: persisted.driverId,
          events: persisted.events,
        });
        return;
      }
      send(socket, {
        type: "error",
        message: `no session "${msg.sessionId}"`,
      });
      return;
    }

    cancelReap(session);

    const resumed = msg.resumeToken
      ? findParticipantByToken(session, msg.resumeToken)
      : undefined;

    if (resumed) {
      // The old socket may still technically be open (e.g. a slow close
      // racing this reconnect) — it's stale either way, so reclaim the seat.
      if (resumed.socket && resumed.socket !== socket) {
        connections.delete(resumed.socket);
        resumed.socket.terminate();
      }
      cancelParticipantGrace(resumed);
      resumed.socket = socket;
      connections.set(socket, { session, participant: resumed });

      send(socket, { type: "joined", participantId: resumed.id, token: resumed.token });
      send(socket, { type: "history", events: session.events });
      send(socket, sessionStateMessage(session));
      // Nobody saw them leave (presence never changed during grace), so
      // there's nothing to broadcast to everyone else.
      return;
    }

    const participant: SessionParticipant = {
      id: randomUUID(),
      displayName: name.value,
      socket,
      token: randomUUID(),
      graceTimer: null,
    };
    session.participants.set(participant.id, participant);
    connections.set(socket, { session, participant });

    // First joiner becomes driver (spec §6.2). Enforcing the lock on
    // `instruct` and the request/hand-over flow are Phase 3 — for now this
    // is just bookkeeping so session_state reports someone.
    if (session.driverId === null) {
      setDriver(session, participant.id);
    }

    send(socket, { type: "joined", participantId: participant.id, token: participant.token });
    send(socket, { type: "history", events: session.events });
    send(socket, sessionStateMessage(session));

    broadcast(session, { type: "participant_joined", participant });
    for (const other of session.participants.values()) {
      if (other.socket && other.id !== participant.id) {
        send(other.socket, sessionStateMessage(session));
      }
    }
  }

  wss.on("connection", (socket) => {
    alive.set(socket, true);
    socket.on("pong", () => alive.set(socket, true));

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
          void handleJoin(socket, msg);
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

          const text = validate.instruction(msg.text);
          if (!text.ok) {
            send(socket, { type: "error", message: text.error });
            return;
          }

          appendEvent(session, {
            kind: "user_instruction",
            by: participant.id,
            data: { text: text.value },
          });

          // Never run two agents concurrently against the same working dir /
          // resumed conversation — the instruction still lands in the
          // transcript immediately (above), but the run itself waits until
          // the in-flight one settles. onRunSettled() drains this queue.
          if (session.status === "working") {
            session.instructionQueue.push(text.value);
          } else {
            setStatus(session, "working");
            runAgent(session, text.value);
          }
          break;
        }

        case "request_control": {
          const state = connections.get(socket);
          if (!state) return;
          const { session, participant } = state;

          if (session.driverId === null) {
            // Nobody's driving — nothing to grant, nothing to wait for.
            setDriver(session, participant.id);
            broadcast(session, {
              type: "control_changed",
              driverId: participant.id,
            });
            return;
          }

          const driver = session.participants.get(session.driverId);
          if (driver?.socket) {
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

          setDriver(session, msg.toParticipantId);
          broadcast(session, {
            type: "control_changed",
            driverId: session.driverId,
          });
          break;
        }

        case "cancel_request": {
          const state = connections.get(socket);
          if (!state) return;
          const { session, participant } = state;

          if (!session.driverId) return;
          const driver = session.participants.get(session.driverId);
          if (driver?.socket) {
            send(driver.socket, {
              type: "control_request_cancelled",
              participantId: participant.id,
            });
          }
          break;
        }

        case "stop": {
          const state = connections.get(socket);
          if (!state) return;
          const { session, participant } = state;

          if (participant.id !== session.driverId) {
            send(socket, {
              type: "error",
              message: "only the driver can stop the agent",
            });
            return;
          }

          // Stop means stop — anything queued behind the current run was
          // only ever going to run because this one finished normally.
          session.instructionQueue.length = 0;
          session.agentAbort?.abort();
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

        // Bring-your-own-key. The value never leaves this handler except as
        // its last four characters (agentInfo -> session_state), and it is
        // deliberately absent from every log line here — an "invalid key"
        // message that prints the key is the classic way these leak.
        case "set_key": {
          const state = connections.get(socket);
          if (!state) return;
          const { session, participant } = state;

          if (!byoKeysAllowed()) {
            send(socket, {
              type: "error",
              message:
                "this deployment doesn't accept user-supplied keys — run Relay yourself to use your own",
            });
            return;
          }
          if (participant.id !== session.driverId) {
            send(socket, {
              type: "error",
              message: "only the driver can set the session key",
            });
            return;
          }

          const key = validate.apiKey(msg.key);
          if (!key.ok) {
            send(socket, { type: "error", message: key.error });
            return;
          }

          // Checked against Anthropic before it's accepted. A bad key that
          // gets stored surfaces three minutes later as the agent's answer
          // (measured) instead of as an answer to the question just asked.
          const epoch = ++session.apiKeyEpoch;
          void verifyApiKey(key.value).then((check) => {
            if (!check.ok) {
              send(socket, { type: "error", message: check.error });
              return;
            }
            // Re-read state: the round trip above means the socket may have
            // gone, the wheel may have moved, or the key may have been
            // cleared or replaced since the request was made.
            if (session.apiKeyEpoch !== epoch) return;
            const now = connections.get(socket);
            if (!now || now.session !== session) return;
            if (participant.id !== session.driverId) return;

            session.apiKey = key.value;
            session.apiKeyHint = validate.keyHint(key.value);
            session.apiKeyOwner = participant.id;

            // Everyone, not just the setter: "whose money is this run
            // spending" is the room's business, and the header says so on
            // every screen.
            broadcast(session, sessionStateMessage(session));
          });
          break;
        }

        case "clear_key": {
          const state = connections.get(socket);
          if (!state) return;
          const { session, participant } = state;

          // The owner can always take their own key back, even if the wheel
          // has since moved on to someone else.
          const owner = session.apiKeyOwner === participant.id;
          if (!owner && participant.id !== session.driverId) {
            send(socket, {
              type: "error",
              message: "only the driver or the key's owner can clear it",
            });
            return;
          }

          if (clearSessionKey(session)) {
            broadcast(session, sessionStateMessage(session));
          }
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

          // Falls back rather than erroring: the title is a convenience on a
          // commit message, and refusing to publish real work over a bad one
          // would be the wrong trade.
          const checked = validate.publishTitle(msg.title);
          const title = checked.ok
            ? checked.value
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

          setDriver(session, null);
          broadcast(session, { type: "control_changed", driverId: null });
          break;
        }
      }
    });

    socket.on("close", () => handleDisconnect(socket));
  });
}
