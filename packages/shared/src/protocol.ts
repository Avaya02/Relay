// WS message contract shared between packages/web and packages/server.
// Phase 1: session join, live agent event broadcast, catch-up history.
// Phase 3: the driver lock (request_control / hand_over / release_control /
// control_changed / control_requested).

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

// Ask the current driver to hand over. If nobody is driving, the server
// grants this immediately instead of leaving it stranded with no one to
// approve it.
export type RequestControlMessage = { type: "request_control" };

// Driver only. Not just a reply to a request — the driver can hand over to
// any connected participant directly (spec §7's own copy: "Hand over to
// alex").
export type HandOverMessage = {
  type: "hand_over";
  toParticipantId: string;
};

// Driver only. Drops the lock; nobody drives until someone requests it.
export type ReleaseControlMessage = { type: "release_control" };

export type ClientMessage =
  | JoinMessage
  | InstructMessage
  | PingMessage
  | RequestControlMessage
  | HandOverMessage
  | ReleaseControlMessage;

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

// The lock moved (hand-over, release, auto-grant, or the driver disconnected).
export type ControlChangedMessage = {
  type: "control_changed";
  driverId: string | null;
};

// Sent to the current driver only — drives the "grant?" prompt.
export type ControlRequestedMessage = {
  type: "control_requested";
  participantId: string;
  displayName: string;
};

export type ServerMessage =
  | JoinedMessage
  | SessionStateMessage
  | HistoryMessage
  | AgentEventMessage
  | StatusMessage
  | ParticipantJoinedMessage
  | ParticipantLeftMessage
  | ErrorMessage
  | PongMessage
  | ControlChangedMessage
  | ControlRequestedMessage;
