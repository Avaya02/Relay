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
  MAX_SUGGESTIONS,
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

function sendRunner(socket: WebSocket, message: ServerToRunnerMessage): void {
  socket.send(JSON.stringify(message));
}

// Agent output can echo a key (failed auth, `env`); scrub before it reaches the
// transcript, every browser and Postgres. The agent scrubs too (redact.ts).
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

// Half-open connections (laptop lid, NAT timeout) never fire 'close' and would
// leave a phantom participant in presence forever.
const HEARTBEAT_MS = 30_000;

export function attachWs(wss: WebSocketServer): void {
  const connections = new Map<WebSocket, ConnectionState>();
  const alive = new WeakMap<WebSocket, boolean>();
  // Separate from connections: a runner has no seat, identity or driver lock.
  const runnerSockets = new Map<WebSocket, Session>();
  const pendingChanges = new Map<string, WebSocket>();

  // Generous because `git add -A` on a large tree is slow; the timeout only
  // stops an unresponsive runner from leaking entries.
  const CHANGES_TIMEOUT_MS = 30_000;

  function dispatchInstruction(session: Session, text: string): void {
    if (!session.runnerSocket) return;
    session.stoppedBy = null;
    sendRunner(session.runnerSocket, {
      type: "run_instruction",
      text,
      resume: session.agentSessionId ?? undefined,
    });
  }

  // Shared by `instruct` and `promote_suggestion` so they can't drift apart.
  function commitInstruction(
    session: Session,
    text: string,
    byParticipantId: string,
  ): void {
    appendEvent(session, {
      kind: "user_instruction",
      by: byParticipantId,
      data: { text },
    });

    // Queued so two agents never run against the same working dir.
    if (session.status === "working") {
      session.instructionQueue.push(text);
    } else {
      setStatus(session, "working");
      dispatchInstruction(session, text);
    }
  }

  function broadcastSuggestions(session: Session): void {
    broadcast(session, { type: "suggestions", items: session.suggestions });
  }

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, HEARTBEAT_MS);
  wss.on("close", () => clearInterval(heartbeat));

  // Runs only if the grace timer expires without a reconnect.
  function finalizeDisconnect(
    session: Session,
    participant: SessionParticipant,
  ): void {
    session.participants.delete(participant.id);

    // Free the lock instead of reassigning: nobody drives until someone claims it.
    if (session.driverId === participant.id) {
      setDriver(session, null);
      broadcast(session, { type: "control_changed", driverId: null });
    }

    broadcast(session, { type: "participant_left", participant });
    for (const other of session.participants.values()) {
      if (other.socket) send(other.socket, sessionStateMessage(session));
    }

    // Stop the run so an abandoned session doesn't keep spending the host's credit.
    if (liveParticipantCount(session) === 0) {
      session.instructionQueue.length = 0;
      session.stoppedBy = null;
      if (session.runnerSocket) sendRunner(session.runnerSocket, { type: "stop_run" });
      scheduleReap(session);
    }
  }

  // The token check is the only thing letting a socket execute instructions.
  function handleRunnerHello(socket: WebSocket, msg: RunnerHelloMessage): void {
    const session = getSession(msg.sessionId);
    if (!session) {
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

    // Newest wins: a restarted CLI's predecessor is usually a dead socket.
    if (session.runnerSocket && session.runnerSocket !== socket) {
      runnerSockets.delete(session.runnerSocket);
      session.runnerSocket.terminate();
    }

    session.runnerSocket = socket;
    session.repoName = msg.repoName;
    session.agentMode = msg.mode;
    session.keySource = msg.keySource;
    session.keyHint = msg.keyHint;
    session.model = msg.model ?? null;
    // Restored only on the runner's word that its clone still exists.
    if (msg.resumeAgentSession) {
      session.agentSessionId = msg.resumeAgentSession;
      mirrorSessionMeta(session);
    }
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
        const stopper = msg.kind === "agent_stopped" ? session.stoppedBy : null;
        if (msg.kind === "agent_stopped") session.stoppedBy = null;
        appendEvent(session, {
          kind: msg.kind,
          by: stopper ?? undefined,
          data: redactEventData(msg.data),
        });
        break;
      }

      case "runner_status": {
        setStatus(session, msg.status);
        // A settled run releases the queue.
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
        // The requester may have left while this was in flight.
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

  // No grace window: a run on a vanished machine never reports, so "working" would hang.
  function handleRunnerDisconnect(socket: WebSocket): void {
    const session = runnerSockets.get(socket);
    if (!session) return;
    runnerSockets.delete(socket);
    if (session.runnerSocket !== socket) return;

    session.runnerSocket = null;
    session.instructionQueue.length = 0;
    session.agentSessionId = null;
    if (session.status === "working") {
      // The runner can't report its own ending once its socket is gone.
      appendEvent(session, { kind: "agent_stopped", data: { reason: "host_disconnected" } });
      setStatus(session, "idle");
    }
    broadcast(session, sessionStateMessage(session));
  }

  function handleDisconnect(socket: WebSocket): void {
    handleRunnerDisconnect(socket);

    const state = connections.get(socket);
    if (!state) return;
    connections.delete(socket);

    const { session, participant } = state;
    // A reconnect may already own this participant; this close arrived late.
    if (participant.socket !== socket) return;
    participant.socket = null;

    scheduleParticipantGrace(participant, () =>
      finalizeDisconnect(session, participant),
    );
  }

  async function handleJoin(socket: WebSocket, msg: JoinMessage): Promise<void> {
    // A second join would orphan the first participant (connections is keyed by socket).
    if (connections.has(socket)) {
      send(socket, { type: "error", message: "already joined a session" });
      return;
    }

    const name = validate.displayName(msg.displayName);
    if (!name.ok) {
      send(socket, { type: "error", message: name.error });
      return;
    }

    const session = getSession(msg.sessionId);
    if (!session) {
      // Not live, but it may exist in Postgres: read-only replay.
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
      // The old socket may still look open (slow close); it's stale either way.
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
      if (session.suggestions.length) {
        send(socket, { type: "suggestions", items: session.suggestions });
      }
      // Presence never changed during grace, so there's nothing to broadcast.
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

    if (session.driverId === null) {
      setDriver(session, participant.id);
    }

    send(socket, { type: "joined", participantId: participant.id, token: participant.token });
    send(socket, { type: "history", events: session.events });
    send(socket, sessionStateMessage(session));
    if (session.suggestions.length) {
      send(socket, { type: "suggestions", items: session.suggestions });
    }

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

    // An unhandled 'error' (e.g. an unmasked client frame) throws and would take
    // down every session; terminate() makes 'close' fire so cleanup still runs.
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

      // Runners speak a different message set; a socket is one from its hello onward.
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

          // The server enforces the driver lock; the UI hiding controls isn't enough.
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

          // Without a runner nothing can execute this; don't queue it into a void.
          if (!session.runnerSocket) {
            send(socket, {
              type: "error",
              message:
                "no agent is connected — run `npx relayrun` in the repository to start one",
            });
            return;
          }

          commitInstruction(session, text.value, participant.id);
          break;
        }

        case "request_control": {
          const state = connections.get(socket);
          if (!state) return;
          const { session, participant } = state;

          if (session.driverId === null) {
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

          // No busy check on purpose: control may change hands mid-run.
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

          // Queued instructions assumed the current run would finish normally.
          session.instructionQueue.length = 0;
          session.stoppedBy = participant.id;
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
          // Read-only, so not driver-gated. The reply comes via the runner's
          // socket, so requestId is how it finds its way back to this browser.
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

          // Publishing writes to a branch and possibly GitHub, so it's driver-only.
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

          // Fall back rather than refuse to publish real work over a bad title.
          const checked = validate.publishTitle(msg.title);
          const title = checked.ok
            ? checked.value
            : `Relay session ${session.id}`;

          sendRunner(session.runnerSocket, { type: "run_publish", title });
          break;
        }

        // Deliberately not driver-gated: it's how non-drivers contribute.
        case "suggest": {
          const state = connections.get(socket);
          if (!state) return;
          const { session, participant } = state;

          const text = validate.instruction(msg.text);
          if (!text.ok) {
            send(socket, { type: "error", message: text.error });
            return;
          }
          if (session.suggestions.length >= MAX_SUGGESTIONS) {
            send(socket, {
              type: "error",
              message: "too many pending suggestions — wait for the driver to clear some",
            });
            return;
          }

          session.suggestions.push({
            id: randomUUID(),
            text: text.value,
            by: participant.id,
            displayName: participant.displayName,
            ts: new Date().toISOString(),
          });
          broadcastSuggestions(session);
          break;
        }

        // Driver-only: promoting starts a run, same privilege as `instruct`.
        case "promote_suggestion": {
          const state = connections.get(socket);
          if (!state) return;
          const { session, participant } = state;

          if (participant.id !== session.driverId) {
            send(socket, {
              type: "error",
              message: "only the driver can send a suggestion to the agent",
            });
            return;
          }
          if (!session.runnerSocket) {
            send(socket, {
              type: "error",
              message: "no agent is connected — run `npx relayrun` in the repository to start one",
            });
            return;
          }

          const index = session.suggestions.findIndex((s) => s.id === msg.id);
          // Already promoted or dismissed by someone else.
          if (index === -1) return;
          const [promoted] = session.suggestions.splice(index, 1);
          broadcastSuggestions(session);

          // Attributed to the driver, who chose to run it, not the author.
          commitInstruction(session, promoted.text, participant.id);
          break;
        }

        // Driver or author only, so one watcher can't silence another.
        case "dismiss_suggestion": {
          const state = connections.get(socket);
          if (!state) return;
          const { session, participant } = state;

          const suggestion = session.suggestions.find((s) => s.id === msg.id);
          if (!suggestion) return;
          if (participant.id !== session.driverId && participant.id !== suggestion.by) {
            send(socket, {
              type: "error",
              message: "only the driver or the author can remove a suggestion",
            });
            return;
          }

          session.suggestions = session.suggestions.filter((s) => s.id !== msg.id);
          broadcastSuggestions(session);
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
