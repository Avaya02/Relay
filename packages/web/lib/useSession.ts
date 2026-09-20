"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentInfo,
  Event,
  Participant,
  PlanItem,
  ServerMessage,
  SessionStatus,
  Suggestion,
  ToolDetail,
} from "@relay/shared";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";

export type ConnectionState = "connecting" | "open" | "closed" | "error";

export type SessionChanges = {
  files: { path: string; insertions: number; deletions: number }[];
  insertions: number;
  deletions: number;
  patch: string;
};

export type PublishState = {
  ok: boolean;
  branch?: string;
  pushed?: boolean;
  prUrl?: string | null;
  note?: string;
  error?: string;
};

// A session that isn't live but whose transcript survived a restart (spec
// §6.5's read-only replay). Present instead of a normal join — there's no
// participant identity in a dead session, so `selfId` never gets set.
export type ReplayedSession = {
  status: SessionStatus;
  driverId: string | null;
  events: Event[];
};

export type UseSessionResult = {
  connection: ConnectionState;
  selfId: string | null;
  /**
   * A rejoin is already in flight from a remembered identity, so the join
   * form would be asking for something the page is about to supply itself.
   */
  resuming: boolean;
  events: Event[];
  participants: Participant[];
  driverId: string | null;
  status: SessionStatus;
  lastError: string | null;
  pendingRequests: Participant[];
  changes: SessionChanges | null;
  publishState: PublishState | null;
  publishing: boolean;
  replayed: ReplayedSession | null;
  repo: string | null;
  /** What runs on the next instruction, and on whose credentials. */
  agent: AgentInfo | null;
  /** Newest plan in the transcript, or null if the agent never made one. */
  plan: PlanItem[] | null;
  /** Proposals from the room, waiting for the driver to send or drop one. */
  suggestions: Suggestion[];
  /** Every run this session has paid for, summed. */
  totalCostUsd: number;
  runCount: number;
  join: (displayName: string) => void;
  instruct: (text: string) => void;
  stop: () => void;
  requestControl: () => void;
  cancelRequest: () => void;
  handOver: (toParticipantId: string) => void;
  releaseControl: () => void;
  requestChanges: () => void;
  publish: (title: string) => void;
  suggest: (text: string) => void;
  promoteSuggestion: (id: string) => void;
  dismissSuggestion: (id: string) => void;
};

// The agent's newest plan wins — a TodoWrite supersedes every earlier one,
// so this walks backwards and stops at the first it finds. Scanning the
// transcript (rather than storing plan state) is what makes the plan correct
// for a late joiner and after a reconnect: both replay `history`, and the
// answer falls out of the same events everyone else already has.
function latestPlan(events: Event[]): PlanItem[] | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.kind !== "tool_call") continue;
    const detail = (event.data as { detail?: ToolDetail }).detail;
    if (detail?.type === "plan" && detail.todos.length) return detail.todos;
  }
  return null;
}

// What this session has actually cost, across every turn. The per-run figure
// already rides on each agent_done; nothing was adding them up, so a session
// with six turns showed six separate prices and no total.
function runTotals(events: Event[]): {
  totalCostUsd: number;
  runCount: number;
} {
  let totalCostUsd = 0;
  let runCount = 0;
  for (const event of events) {
    if (event.kind !== "agent_done") continue;
    runCount++;
    const cost = (event.data as { costUsd?: number }).costUsd;
    if (typeof cost === "number" && Number.isFinite(cost)) totalCostUsd += cost;
  }
  return { totalCostUsd, runCount };
}

/**
 * The identity this tab holds in a session, so a refresh rejoins instead of
 * asking who you are again.
 *
 * sessionStorage, deliberately, not localStorage: a token names one
 * participant, and localStorage would hand the same one to every tab — two
 * windows of the same session would then fight over a single seat. Per-tab
 * also means closing the tab genuinely leaves.
 */
type SavedIdentity = { name: string; token: string };

const identityKey = (sessionId: string) => `relay:identity:${sessionId}`;

function readIdentity(sessionId: string): SavedIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(identityKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedIdentity>;
    if (typeof parsed.name !== "string" || typeof parsed.token !== "string") return null;
    return parsed.name ? { name: parsed.name, token: parsed.token } : null;
  } catch {
    // Private mode, cleared storage, or a value someone else wrote. Asking
    // for a name again is a fine outcome; throwing on mount is not.
    return null;
  }
}

function saveIdentity(sessionId: string, identity: SavedIdentity): void {
  if (typeof window === "undefined" || !identity.name) return;
  try {
    window.sessionStorage.setItem(identityKey(sessionId), JSON.stringify(identity));
  } catch {
    // Storage is full or blocked — the session still works, it just won't
    // survive a refresh.
  }
}

function clearIdentity(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(identityKey(sessionId));
  } catch {
    // Nothing to recover from: the stale value simply stays.
  }
}

// Connects once per mount, sends `join`, and reduces every incoming
// ServerMessage into local state. Rendering strictly follows the server's
// `seq` order (spec: "Never trust client timing") — events arrive already
// ordered (history replay, then live agent_events) and we only ever append.
//
// Reconnect (spec C1/C2): a dropped socket retries with backoff and rejoins
// automatically. The server's own grace window (sessions.ts) is what makes
// this transparent rather than just fast — a `resumeToken` carried across
// the reconnect reattaches to the same participant identity (still driving,
// if it was driving) instead of arriving as a stranger.
export function useSession(sessionId: string): UseSessionResult {
  const socketRef = useRef<WebSocket | null>(null);
  const pendingDisplayName = useRef<string | null>(null);
  const resumeToken = useRef<string | null>(null);

  // Hydrated during the first render rather than in an effect: the socket
  // opens from an effect, and a name that arrives after that has already
  // missed the `join` it was needed for.
  //
  // Only refs are written, never state, so there is nothing for the server
  // render to disagree with.
  const hydrated = useRef(false);
  if (!hydrated.current) {
    hydrated.current = true;
    const saved = readIdentity(sessionId);
    if (saved) {
      pendingDisplayName.current = saved.name;
      resumeToken.current = saved.token;
    }
  }

  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [selfId, setSelfId] = useState<string | null>(null);
  // The socket handlers are attached once and would otherwise close over the
  // first render's `selfId` forever.
  const selfIdRef = useRef<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Participant[]>([]);
  const [changes, setChanges] = useState<SessionChanges | null>(null);
  const [publishState, setPublishState] = useState<PublishState | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [replayed, setReplayed] = useState<ReplayedSession | null>(null);
  const [repo, setRepo] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // Both derived from the transcript rather than tracked as their own state:
  // the events are already the source of truth, already ordered by the
  // server, and already replayed to late joiners — so a watcher who arrives
  // mid-run gets the current plan and the running cost with no extra
  // protocol and no chance of the two disagreeing.
  const plan = useMemo(() => latestPlan(events), [events]);
  const { totalCostUsd, runCount } = useMemo(() => runTotals(events), [events]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function scheduleReconnect() {
      if (cancelled) return;
      // 1s, 2s, 4s, 8s, capped at 15s, with jitter so a whole room of
      // reconnecting clients doesn't hammer the server in lockstep.
      const base = Math.min(15_000, 1000 * 2 ** attempt);
      attempt++;
      const delay = base * (0.7 + Math.random() * 0.6);
      retryTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (cancelled) return;
      const socket = new WebSocket(WS_URL);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        attempt = 0;
        setConnection("open");
        if (pendingDisplayName.current) {
          socket.send(
            JSON.stringify({
              type: "join",
              sessionId,
              displayName: pendingDisplayName.current,
              resumeToken: resumeToken.current ?? undefined,
            }),
          );
        }
      });

      socket.addEventListener("close", () => {
        if (cancelled) return;
        setConnection("closed");
        scheduleReconnect();
      });

      socket.addEventListener("error", () => {
        if (cancelled) return;
        setConnection("error");
      });

      socket.addEventListener("message", (raw) => {
        const msg: ServerMessage = JSON.parse(raw.data);
        switch (msg.type) {
          case "joined":
            resumeToken.current = msg.token;
            // Written here rather than at join time because only the server
            // can mint the token, and a name without one rejoins as a
            // stranger.
            saveIdentity(sessionId, {
              name: pendingDisplayName.current ?? "",
              token: msg.token,
            });
            selfIdRef.current = msg.participantId;
            setSelfId(msg.participantId);
            break;
          case "replay":
            setReplayed({
              status: msg.status,
              driverId: msg.driverId,
              events: msg.events,
            });
            setEvents(msg.events);
            break;
          case "history":
            setEvents(msg.events);
            // Catching up on the transcript is only half the picture — the
            // other half is what the repo looks like now. Without this,
            // someone who joins after a turn finished sees the ledger say a
            // file was written and the workspace not list it, because
            // `session_changes` was only ever sent in reply to a turn ending.
            // Cheap and idempotent: a session that never ran has no working
            // dir and the server answers with an empty set.
            socket.send(JSON.stringify({ type: "request_changes" }));
            break;
          case "agent_event":
            setEvents((prev) => [...prev, msg.event]);
            break;
          case "session_state":
            setParticipants(msg.participants);
            setDriverId(msg.driverId);
            setStatus(msg.status);
            if (msg.repo !== undefined) setRepo(msg.repo);
            if (msg.agent !== undefined) setAgent(msg.agent);
            break;
          case "status":
            setStatus(msg.status);
            // A finished turn is exactly when "so what changed?" becomes the
            // question. Asking here (inside the socket's message handler,
            // not an effect) keeps it a plain event-driven request.
            if (msg.status === "done") {
              socket.send(JSON.stringify({ type: "request_changes" }));
            }
            break;
          case "suggestions":
            setSuggestions(msg.items);
            break;
          case "session_changes":
            setChanges({
              files: msg.files,
              insertions: msg.insertions,
              deletions: msg.deletions,
              patch: msg.patch,
            });
            break;
          case "publish_result":
            setPublishing(false);
            setPublishState({
              ok: msg.ok,
              branch: msg.branch,
              pushed: msg.pushed,
              prUrl: msg.prUrl,
              note: msg.note,
              error: msg.error,
            });
            break;
          case "participant_joined":
          case "participant_left":
            // session_state is sent alongside these and is the source of
            // truth for the participant list — nothing to do here.
            break;
          case "control_changed":
            setDriverId(msg.driverId);
            // Whoever it moved to, every outstanding request is now stale.
            setPendingRequests([]);
            break;
          case "control_requested":
            setPendingRequests((prev) =>
              prev.some((p) => p.id === msg.participantId)
                ? prev
                : [
                    ...prev,
                    { id: msg.participantId, displayName: msg.displayName },
                  ],
            );
            break;
          case "control_request_cancelled":
            setPendingRequests((prev) =>
              prev.filter((p) => p.id !== msg.participantId),
            );
            break;
          case "error":
            // A refusal aimed at the rejoin itself means the stored identity
            // is the problem; drop it so the next load asks cleanly rather
            // than retrying the same bad token forever.
            if (selfIdRef.current === null) clearIdentity(sessionId);
            setLastError(msg.message);
            break;
          case "pong":
            break;
        }
      });
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      socketRef.current?.close();
    };
  }, [sessionId]);

  function join(displayName: string) {
    pendingDisplayName.current = displayName;
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "join", sessionId, displayName }));
    }
  }

  function instruct(text: string) {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "instruct", text }));
    }
  }

  function stop() {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "stop" }));
    }
  }

  function requestControl() {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "request_control" }));
    }
  }

  function cancelRequest() {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "cancel_request" }));
    }
  }

  function handOver(toParticipantId: string) {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "hand_over", toParticipantId }));
    }
  }

  function releaseControl() {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "release_control" }));
    }
  }

  function requestChanges() {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "request_changes" }));
    }
  }

  function suggest(text: string) {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "suggest", text }));
    }
  }

  function promoteSuggestion(id: string) {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "promote_suggestion", id }));
    }
  }

  function dismissSuggestion(id: string) {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "dismiss_suggestion", id }));
    }
  }

  function publish(title: string) {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      setPublishing(true);
      setPublishState(null);
      socket.send(JSON.stringify({ type: "publish", title }));
    }
  }

  return {
    connection,
    selfId,
    // A name was restored and the server hasn't confirmed it yet. Nothing to
    // ask the viewer for, so the form shouldn't be on screen.
    resuming: pendingDisplayName.current !== null && selfId === null && lastError === null,
    events,
    participants,
    driverId,
    status,
    lastError,
    pendingRequests,
    changes,
    publishState,
    publishing,
    replayed,
    repo,
    agent,
    plan,
    suggestions,
    totalCostUsd,
    runCount,
    join,
    instruct,
    stop,
    requestControl,
    cancelRequest,
    handOver,
    releaseControl,
    requestChanges,
    publish,
    suggest,
    promoteSuggestion,
    dismissSuggestion,
  };
}
