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

// A dead session has no participant identity, so `selfId` is never set.
export type ReplayedSession = {
  status: SessionStatus;
  driverId: string | null;
  events: Event[];
};

export type UseSessionResult = {
  connection: ConnectionState;
  selfId: string | null;
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
  agent: AgentInfo | null;
  plan: PlanItem[] | null;
  suggestions: Suggestion[];
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

// Derived from the transcript, not stored, so late joiners and reconnects (which
// replay `history`) get the right plan for free.
function latestPlan(events: Event[]): PlanItem[] | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.kind !== "tool_call") continue;
    const detail = (event.data as { detail?: ToolDetail }).detail;
    if (detail?.type === "plan" && detail.todos.length) return detail.todos;
  }
  return null;
}

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

// sessionStorage, not localStorage: a token names one participant, and sharing
// it across tabs would make two windows fight over one seat.
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
    // Private mode or a foreign value: asking for a name again beats throwing on mount.
    return null;
  }
}

function saveIdentity(sessionId: string, identity: SavedIdentity): void {
  if (typeof window === "undefined" || !identity.name) return;
  try {
    window.sessionStorage.setItem(identityKey(sessionId), JSON.stringify(identity));
  } catch {
    // Blocked or full; the session just won't survive a refresh.
  }
}

function clearIdentity(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(identityKey(sessionId));
  } catch {
    // Nothing to recover; the stale value stays.
  }
}

// Events arrive ordered by the server, so we only append. On reconnect the
// resumeToken plus the server's grace window reattach the same participant.
export function useSession(sessionId: string): UseSessionResult {
  const socketRef = useRef<WebSocket | null>(null);
  const pendingDisplayName = useRef<string | null>(null);
  const resumeToken = useRef<string | null>(null);

  // Read during the first render, not an effect: the socket opens from an effect
  // and a later name would miss its `join`. Only refs are written, so SSR agrees.
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
  // Handlers attach once and would close over the first render's selfId.
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

  // Derived from events so a mid-run joiner gets them with no extra protocol.
  const plan = useMemo(() => latestPlan(events), [events]);
  const { totalCostUsd, runCount } = useMemo(() => runTotals(events), [events]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function scheduleReconnect() {
      if (cancelled) return;
      // Jitter keeps a whole room from reconnecting in lockstep.
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
            // Saved now because only the server mints the token.
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
            // Late joiners would otherwise see files written in the ledger but
            // missing from the workspace; changes were only sent when a turn ended.
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
            // session_state, sent alongside, owns the participant list.
            break;
          case "control_changed":
            setDriverId(msg.driverId);
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
            // A refused rejoin means the stored identity is bad; drop it rather than retry forever.
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
    // A restored name the server hasn't confirmed yet; the join form shouldn't show.
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
