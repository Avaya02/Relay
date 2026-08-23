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
  | { type: "text"; text: string }
  | { type: "plan"; todos: PlanItem[] };

export type DiffLine = { op: " " | "-" | "+"; text: string };

// The agent's own checklist for a multi-step task, straight off its
// TodoWrite calls. This is *state*, not a log entry: the newest one
// supersedes the rest, and the client derives "the current plan" by taking
// the last one in the transcript — which means replay and late-joiner
// catch-up work with no extra protocol.
//
// It matters more here than in a single-player agent tool: most people in a
// Relay session are watching, not driving, and a watcher can't ask "where
// are we?". The plan is what makes a twenty-minute run legible to them.
export type PlanItem = {
  content: string;
  status: "pending" | "in_progress" | "completed";
  /** Present-tense label the agent shows while the step is running. */
  activeForm?: string;
};

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
  // Present on a reconnect: lets the server reattach to the same participant
  // identity (and keep driving, if it was driving) instead of appearing as a
  // stranger. Absent on a first join.
  resumeToken?: string;
};

export type InstructMessage = {
  type: "instruct";
  text: string;
};

// Driver only. Aborts the in-flight run and drops anything queued behind it —
// "stop" means stop, not "skip to the next instruction."
export type StopMessage = { type: "stop" };

// Withdraw a control request before the driver acts on it.
export type CancelRequestMessage = { type: "cancel_request" };

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

// Driver only. Supplies an Anthropic API key for THIS session, so a shared
// deployment can run the real agent on the viewer's own credentials instead
// of the host's. The key is held in memory for the session's lifetime and is
// never persisted, logged, or sent back to any client — only `keyHint` (its
// last four characters) ever leaves the server.
export type SetKeyMessage = { type: "set_key"; key: string };

// Driver only. Drops the session key; the session falls back to whatever the
// server itself is configured with (usually the mock agent).
export type ClearKeyMessage = { type: "clear_key" };

export type ClientMessage =
  | JoinMessage
  | InstructMessage
  | StopMessage
  | CancelRequestMessage
  | PingMessage
  | RequestControlMessage
  | HandOverMessage
  | ReleaseControlMessage
  | RequestChangesMessage
  | PublishMessage
  | SetKeyMessage
  | ClearKeyMessage;

// --- Server -> Client ---

// Not in the spec's protocol table verbatim, but the table also never says
// how a socket learns its own assigned participant id (needed to tell "you"
// apart from others, and in Phase 3 to check "am I the driver"). This fills
// that gap the same way `history` already works: sent once, joiner only,
// right after `join`.
export type JoinedMessage = {
  type: "joined";
  participantId: string;
  // Hand this back on `join` after a reconnect to reattach to this same
  // participant (see JoinMessage.resumeToken). Never persisted server-side
  // beyond the grace window — losing it just means rejoining as a new person.
  token: string;
};

// Sent instead of `joined`/`history` when the session isn't live but its
// transcript survived a restart. There's no participant identity here — a
// dead session has nobody to be.
export type ReplayMessage = {
  type: "replay";
  status: SessionStatus;
  driverId: string | null;
  events: Event[];
};

/**
 * What will actually run when the driver sends the next instruction, and why.
 *
 * The room deserves to know this without asking. "The agent is scripted" and
 * "the agent is real, on Sam's key, and Sam is being billed" are very
 * different situations to be watching, and neither was visible before.
 */
export type AgentInfo = {
  /** `mock` is the scripted offline agent; `real` runs the Agent SDK. */
  mode: "mock" | "real";
  /**
   * Where the credentials come from. `server` means the host configured its
   * own; `session` means someone in this room supplied a key for it.
   */
  source: "mock" | "server" | "session";
  /** Last four characters of the session key, if one is set. Never the key. */
  keyHint: string | null;
  /** Display name of whoever supplied it, so the room knows who's paying. */
  keyOwner: string | null;
  /**
   * Whether this deployment accepts a user-supplied key at all. False on a
   * public demo: the agent has unrestricted shell access inside its clone, so
   * letting strangers run it is a sandboxing problem, not a billing one.
   */
  byoAllowed: boolean;
};

export type SessionStateMessage = {
  type: "session_state";
  participants: Participant[];
  driverId: string | null;
  status: SessionStatus;
  /**
   * Which codebase this session's agent is working on. Server config, not
   * per-session — but a watcher needs it to orient, and the UI previously
   * never said what was being edited.
   */
  repo?: string | null;
  agent?: AgentInfo;
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

// The requester withdrew before the driver acted on it — drop it from the
// driver's pending list.
export type ControlRequestCancelledMessage = {
  type: "control_request_cancelled";
  participantId: string;
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
  | ReplayMessage
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
  | ControlRequestedMessage
  | ControlRequestCancelledMessage;
