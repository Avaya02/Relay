// WS message contract shared between packages/web and packages/server.
// Phase 1: session join, live agent event broadcast, catch-up history.
// Driver-lock messages (request_control / hand_over / release_control /
// control_changed / control_requested) land in Phase 3, when there's
// server-side logic to actually back them.

export type SessionStatus = "idle" | "working" | "done" | "error";

export type Participant = {
  id: string;
  displayName: string;
};

// The transcript unit. Every meaningful thing the agent (or a driver) does
// becomes one ordered Event — this is what gets streamed, replayed, and
// (from Phase 5) persisted. `seq` is assigned server-side only; it's the
// ordering guarantee that makes two browsers agree on what happened when.
export type EventKind =
  | "user_instruction" // what a driver typed
  | "agent_text" // assistant prose (coalesced — one event per message)
  | "tool_call" // agent invoked a tool: { tool, summary, args? }
  | "tool_result" // result of a tool: { tool, ok, summary }
  | "agent_done" // task turn finished
  | "agent_error";

export type Event = {
  seq: number;
  ts: string;
  kind: EventKind;
  by?: string;
  data: Record<string, unknown>;
};

// --- Client -> Server ---

export type JoinMessage = {
  type: "join";
  sessionId: string;
  displayName: string;
};

export type InstructMessage = {
  type: "instruct";
  text: string;
};

export type PingMessage = { type: "ping" };

export type ClientMessage = JoinMessage | InstructMessage | PingMessage;

// --- Server -> Client ---

// Not in the spec's protocol table verbatim, but the table also never says
// how a socket learns its own assigned participant id (needed to tell "you"
// apart from others, and in Phase 3 to check "am I the driver"). This fills
// that gap the same way `history` already works: sent once, joiner only,
// right after `join`.
export type JoinedMessage = {
  type: "joined";
  participantId: string;
};

export type SessionStateMessage = {
  type: "session_state";
  participants: Participant[];
  driverId: string | null;
  status: SessionStatus;
};

export type HistoryMessage = {
  type: "history";
  events: Event[];
};

export type AgentEventMessage = {
  type: "agent_event";
  event: Event;
};

export type StatusMessage = {
  type: "status";
  status: SessionStatus;
};

export type ParticipantJoinedMessage = {
  type: "participant_joined";
  participant: Participant;
};

export type ParticipantLeftMessage = {
  type: "participant_left";
  participant: Participant;
};

export type ErrorMessage = {
  type: "error";
  message: string;
};

export type PongMessage = { type: "pong" };

export type ServerMessage =
  | JoinedMessage
  | SessionStateMessage
  | HistoryMessage
  | AgentEventMessage
  | StatusMessage
  | ParticipantJoinedMessage
  | ParticipantLeftMessage
  | ErrorMessage
  | PongMessage;
