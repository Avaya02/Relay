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

// --- Well-known `data` shapes ---------------------------------------------
// `data` stays a loose Record (spec §4), but these document what the server
// actually puts in it so both sides agree without casting at every use site.

// Expandable detail behind a ledger row. Collapsed by default — the row's
// summary is the honest one-liner, this is the "show me what actually
// happened" layer (spec §5: summarize, don't dump raw args into the UI).
export type ToolDetail =
  | { type: "diff"; path: string; lines: DiffLine[] }
  | { type: "text"; text: string };

export type DiffLine = { op: " " | "-" | "+"; text: string };

// tool_call — rendered immediately, in a pending state, before its result
// exists. `id` pairs it with the matching tool_result so the client can
// render ONE row per action instead of two (DESIGN.md, ledger rule 1).
export type ToolCallData = {
  id: string;
  tool: string;
  verb: string; // "read" | "edited" | "ran" — the action, for column 1
  target: string; // "README.md" | "npm test" — what it acted on
  detail?: ToolDetail;
};

// tool_result — folded into its tool_call's row on arrival.
export type ToolResultData = {
  id: string;
  tool: string;
  ok: boolean;
  summary: string;
  detail?: ToolDetail;
};

// agent_done — the ledger's capstone row. Metrics come straight off the
// SDK's result message, which already carries all of them.
export type AgentDoneData = {
  steps?: number;
  durationMs?: number;
  costUsd?: number;
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

// Anyone: "what has this session actually changed?" Read-only.
export type RequestChangesMessage = { type: "request_changes" };

// Driver only: commit the session's work to a branch, and push + open a PR if
// the server is configured for it.
export type PublishMessage = { type: "publish"; title: string };

export type ClientMessage =
  | JoinMessage
  | InstructMessage
  | PingMessage
  | RequestControlMessage
  | HandOverMessage
  | ReleaseControlMessage
  | RequestChangesMessage
  | PublishMessage;

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

// What the agent changed, cumulatively, this session. Broadcast to everyone —
// the point is that the room sees the result, not just the driver.
export type SessionChangesMessage = {
  type: "session_changes";
  files: { path: string; insertions: number; deletions: number }[];
  insertions: number;
  deletions: number;
  patch: string;
};

// Outcome of a publish. `pushed: false` with `ok: true` means the work landed
// on a local branch but no GitHub repo/token is configured on the server —
// which is a success, not a failure.
export type PublishResultMessage = {
  type: "publish_result";
  ok: boolean;
  branch?: string;
  pushed?: boolean;
  prUrl?: string | null;
  note?: string;
  error?: string;
};

export type ServerMessage =
  | JoinedMessage
  | SessionChangesMessage
  | PublishResultMessage
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
