"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Event,
  Participant,
  ServerMessage,
  SessionStatus,
} from "@relay/shared";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";

export type ConnectionState = "connecting" | "open" | "closed" | "error";

export type UseSessionResult = {
  connection: ConnectionState;
  selfId: string | null;
  events: Event[];
  participants: Participant[];
  driverId: string | null;
  status: SessionStatus;
  lastError: string | null;
  pendingRequests: Participant[];
  join: (displayName: string) => void;
  instruct: (text: string) => void;
  requestControl: () => void;
  handOver: (toParticipantId: string) => void;
  releaseControl: () => void;
};

// Connects once per mount, sends `join`, and reduces every incoming
// ServerMessage into local state. Rendering strictly follows the server's
// `seq` order (spec: "Never trust client timing") — events arrive already
// ordered (history replay, then live agent_events) and we only ever append.
export function useSession(sessionId: string): UseSessionResult {
  const socketRef = useRef<WebSocket | null>(null);
  const pendingDisplayName = useRef<string | null>(null);

  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [selfId, setSelfId] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Participant[]>([]);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnection("open");
      if (pendingDisplayName.current) {
        socket.send(
          JSON.stringify({
            type: "join",
            sessionId,
            displayName: pendingDisplayName.current,
          }),
        );
      }
    });

    socket.addEventListener("close", () => setConnection("closed"));
    socket.addEventListener("error", () => setConnection("error"));

    socket.addEventListener("message", (raw) => {
      const msg: ServerMessage = JSON.parse(raw.data);
      switch (msg.type) {
        case "joined":
          setSelfId(msg.participantId);
          break;
        case "history":
          setEvents(msg.events);
          break;
        case "agent_event":
          setEvents((prev) => [...prev, msg.event]);
          break;
        case "session_state":
          setParticipants(msg.participants);
          setDriverId(msg.driverId);
          setStatus(msg.status);
          break;
        case "status":
          setStatus(msg.status);
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
        case "error":
          setLastError(msg.message);
          break;
        case "pong":
          break;
      }
    });

    return () => socket.close();
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

  function requestControl() {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "request_control" }));
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

  return {
    connection,
    selfId,
    events,
    participants,
    driverId,
    status,
    lastError,
    pendingRequests,
    join,
    instruct,
    requestControl,
    handOver,
    releaseControl,
  };
}
