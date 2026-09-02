import { randomUUID } from "node:crypto";
import type { WebSocket, WebSocketServer } from "ws";
import type {
  ClientMessage,
  JoinMessage,
  RunnerHelloMessage,
  RunnerMessage,
  ServerMessage,
  ServerToRunnerMessage,
} from "@relay/shared";
import {
  cancelParticipantGrace,
  cancelReap,
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
import type { Session, SessionParticipant } from "./sessions.js";
import { broadcast } from "./sessions.js";
import { appendEvent } from "./transcript.js";
import { mirrorSessionMeta } from "./persist.js";
import { loadPersistedSession } from "./persist.js";

type ConnectionState = {
  session: Session;
  participant: SessionParticipant;
};

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

// Separate from send() so a browser can never be handed a runner-bound message
// by mistake — the two directions have different message sets.
function sendRunner(socket: WebSocket, message: ServerToRunnerMessage): void {
  socket.send(JSON.stringify(message));
}

/**
 * Scrubs key-shaped text out of an event before it is stored and fanned out.
 *
 * Event data is a loose Record whose strings come from agent output — a failed
 * auth message, a command that echoed its environment. Walking it is cheap
 * next to the alternative, which is a key reaching the transcript, every
 * browser in the room and Postgres at once.
 */
function redactEventData(data: Record<string, unknown>): Record<string, unknown> {
  const scrub = (value: unknown): unknown => {
    if (typeof value === "string") return validate.redactKeys(value);
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrub(v)]),
      );
    }
    return value;
  };
  return scrub(data) as Record<string, unknown>;
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
  // The same, for runner sockets. Kept separately because a runner is not a
  // participant: it has no identity in the room, no seat, and no driver lock.
  const runnerSockets = new Map<WebSocket, Session>();
  // Browsers waiting on a changes request that is out at the runner.
  const pendingChanges = new Map<string, WebSocket>();

  // A runner that never answers shouldn't leak an entry per request. Generous:
  // `git add -A` on a large tree is genuinely slow.
  const CHANGES_TIMEOUT_MS = 30_000;

  function dispatchInstruction(session: Session, text: string): void {
    if (!session.runnerSocket) return;
    sendRunner(session.runnerSocket, {
      type: "run_instruction",
      text,
      resume: session.agentSessionId ?? undefined,
    });
  }

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

    // Nobody left watching: tell the runner to stop rather than let an
    // abandoned session keep spending someone's API credit. The working dir is
    // the runner's to clean up — it owns the repo now. The session row itself
    // stays (briefly — see scheduleReap) so a quick refresh can still rejoin.
    if (liveParticipantCount(session) === 0) {
      session.instructionQueue.length = 0;
      if (session.runnerSocket) sendRunner(session.runnerSocket, { type: "stop_run" });
      scheduleReap(session);
    }
  }

  // A runner attaching to its session. This is the only message that can turn
  // an anonymous socket into the one allowed to execute instructions, so the
  // token check is the whole security boundary for that privilege.
  function handleRunnerHello(socket: WebSocket, msg: RunnerHelloMessage): void {
    const session = getSession(msg.sessionId);
    if (!session) {
      // Distinguished from a bad token because the remedy differs: this one is
      // "start a new session", not "check what you pasted".
      sendRunner(socket, {
        type: "runner_rejected",
        reason: `session "${msg.sessionId}" no longer exists — start a new one`,
        fatal: true,
      });
      socket.close();
      return;
    }
    if (session.runnerToken !== msg.token) {
      sendRunner(socket, {
        type: "runner_rejected",
        reason: "invalid runner token for this session",
        fatal: true,
      });
      socket.close();
      return;
    }

    // A second runner would mean two agents against one transcript. The newest
    // wins — a restarted CLI is the common case, and its predecessor is
    // usually a socket that hasn't noticed it's dead yet.
    if (session.runnerSocket && session.runnerSocket !== socket) {
      runnerSockets.delete(session.runnerSocket);
      session.runnerSocket.terminate();
    }

    session.runnerSocket = socket;
    session.repoName = msg.repoName;
    session.agentMode = msg.mode;
    session.keySource = msg.keySource;
    session.keyHint = msg.keyHint;
    runnerSockets.set(socket, session);
    cancelReap(session);

    sendRunner(socket, { type: "runner_ready" });
    broadcast(session, sessionStateMessage(session));
  }

  function handleRunnerMessage(socket: WebSocket, msg: RunnerMessage): void {
    if (msg.type === "runner_hello") {
      handleRunnerHello(socket, msg);
      return;
    }

    const session = runnerSockets.get(socket);
    if (!session) return;

    switch (msg.type) {
      case "runner_event": {
        // Straight into the same function the in-process agent used to call:
        // seq assignment, broadcast and the Postgres mirror are unchanged.
        // Text is scrubbed on the way in — see validate.redactKeys.
        appendEvent(session, { kind: msg.kind, data: redactEventData(msg.data) });
        break;
      }

      case "runner_status": {
        setStatus(session, msg.status);
        // A run that just settled is what releases the queue. This is the old
        // onRunSettled, now driven by the runner reporting in rather than by a
        // promise resolving in this process.
        if (msg.status !== "working") {
          if (liveParticipantCount(session) === 0) {
            session.instructionQueue.length = 0;
            break;
          }
          const next = session.instructionQueue.shift();
          if (next !== undefined) {
            setStatus(session, "working");
            dispatchInstruction(session, next);
          }
        }
        break;
      }

      case "runner_agent_session": {
        session.agentSessionId = msg.agentSessionId;
        mirrorSessionMeta(session);
        break;
      }

      case "runner_changes": {
        const waiting = pendingChanges.get(msg.requestId);
        pendingChanges.delete(msg.requestId);
        // The requester may have closed the tab while this was in flight.
        if (!waiting || waiting.readyState !== waiting.OPEN) break;
        send(waiting, {
          type: "session_changes",
          files: msg.files,
          insertions: msg.insertions,
          deletions: msg.deletions,
          patch: msg.patch,
        });
        break;
      }

      case "runner_publish_result": {
        // Broadcast: everyone watched the work, everyone should see where it
        // landed.
        broadcast(
          session,
          msg.ok
            ? {
                type: "publish_result",
                ok: true,
                branch: msg.branch,
                pushed: msg.pushed,
                prUrl: msg.prUrl,
                note: msg.note,
              }
            : { type: "publish_result", ok: false, error: msg.error },
        );
        break;
      }
    }
  }

  // The host's machine went away. Unlike a participant there's no grace window:
  // an in-flight run on a disconnected machine will never report a result, so
  // leaving the room on "working" would hang it forever.
  function handleRunnerDisconnect(socket: WebSocket): void {
    const session = runnerSockets.get(socket);
    if (!session) return;
    runnerSockets.delete(socket);
    if (session.runnerSocket !== socket) return;

    session.runnerSocket = null;
    session.instructionQueue.length = 0;
    // The conversation can't be resumed against a working dir that is gone.
    session.agentSessionId = null;
    if (session.status === "working") setStatus(session, "idle");
    broadcast(session, sessionStateMessage(session));
  }

  // Whichever way a socket disconnects (clean close, terminate() from the
  // heartbeat, or the error handler below), the accounting is identical —
  // everything funnels through here rather than duplicating cleanup per path.
  function handleDisconnect(socket: WebSocket): void {
    handleRunnerDisconnect(socket);

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
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // Runners share this server with browsers but speak a different message
      // set, so they branch off before the client switch below. A socket is a
      // runner from its hello onward.
      const kind = (parsed as { type?: unknown }).type;
      if (kind === "runner_hello" || runnerSockets.has(socket)) {
        handleRunnerMessage(socket, parsed as RunnerMessage);
        return;
      }

      const msg = parsed as ClientMessage;

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

          // Nothing can execute this without a runner. Say so plainly rather
          // than queueing it into a void — the agent lives on someone's
          // machine now, and that machine may simply not be there.
          if (!session.runnerSocket) {
            send(socket, {
              type: "error",
              message:
                "no agent is connected — run `npx relayd` in the repository to start one",
            });
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
          // the in-flight one settles. The runner_status handler drains this.
          if (session.status === "working") {
            session.instructionQueue.push(text.value);
          } else {
            setStatus(session, "working");
            dispatchInstruction(session, text.value);
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
          if (session.runnerSocket) {
            sendRunner(session.runnerSocket, { type: "stop_run" });
          }
          break;
        }

        case "request_changes": {
          const state = connections.get(socket);
          if (!state) return;
          const { session } = state;
          if (!session.runnerSocket) {
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
          //
          // The answer now arrives on the runner's socket rather than from a
          // promise, so remember who asked. Without the id the reply has no
          // way back to this particular browser.
          const requestId = randomUUID();
          pendingChanges.set(requestId, socket);
          setTimeout(() => pendingChanges.delete(requestId), CHANGES_TIMEOUT_MS);
          sendRunner(session.runnerSocket, {
            type: "request_runner_changes",
            requestId,
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
          if (!session.runnerSocket) {
            send(socket, {
              type: "publish_result",
              ok: false,
              error: "no agent is connected, so there's nothing to publish",
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

          // No request id needed, unlike changes: the result is broadcast to
          // the whole room, so there's no single requester to route back to.
          sendRunner(session.runnerSocket, { type: "run_publish", title });
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
