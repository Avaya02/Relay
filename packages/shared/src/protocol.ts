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

export type ChangedFile = {
  path: string;
  insertions: number;
  deletions: number;
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

// --- Suggestions ---
//
// The one thing a non-driver could do before this was watch. Suggestions give
// watchers a verb without weakening the invariant the whole design rests on:
// proposing and committing are separate acts, and only the driver commits. No
// two instructions can ever race, because a suggestion is inert until someone
// with the wheel promotes it.

export type Suggestion = {
  id: string;
  text: string;
  /** Participant who proposed it — may have since left the room. */
  by: string;
  displayName: string;
  ts: string;
};

export type SuggestMessage = { type: "suggest"; text: string };

/** Driver-only: send a suggestion as the next instruction. */
export type PromoteSuggestionMessage = { type: "promote_suggestion"; id: string };

/** The driver may drop any suggestion; an author may withdraw their own. */
export type DismissSuggestionMessage = { type: "dismiss_suggestion"; id: string };

/** The whole list, re-broadcast on every change — it is short by construction. */
export type SuggestionsMessage = { type: "suggestions"; items: Suggestion[] };

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
  | SuggestMessage
  | PromoteSuggestionMessage
  | DismissSuggestionMessage;

// --- Runner (the relay-agent CLI) -> Server ---
//
// A runner is not a participant: it's the process on the host's machine that
// holds the repo and runs the Agent SDK. It shares the browsers' WebSocket
// server but speaks this message set instead of ClientMessage/ServerMessage.

// `token` is minted by POST /sessions. It's the only thing that lets a socket
// claim to be the runner, so holding it means acting as that room's repo owner.
export type RunnerHelloMessage = {
  type: "runner_hello";
  sessionId: string;
  token: string;
  repoName: string | null;
  mode: "mock" | "real";
  keySource: "oauth" | "api-key" | "mock";
  keyHint: string | null;
};

export type RunnerEventMessage = {
  type: "runner_event";
  kind: EventKind;
  data: Record<string, unknown>;
};

export type RunnerStatusMessage = { type: "runner_status"; status: SessionStatus };

export type RunnerAgentSessionMessage = {
  type: "runner_agent_session";
  agentSessionId: string;
};

// `requestId` pairs this with the request that asked for it: changes now
// round-trip over the network, so the server can no longer reply from a
// closure over the requesting socket.
export type RunnerChangesMessage = {
  type: "runner_changes";
  requestId: string;
  files: ChangedFile[];
  insertions: number;
  deletions: number;
  patch: string;
};

export type RunnerPublishResultMessage = {
  type: "runner_publish_result";
  ok: boolean;
  branch?: string;
  pushed?: boolean;
  prUrl?: string | null;
  note?: string;
  error?: string;
};

export type RunnerMessage =
  | RunnerHelloMessage
  | RunnerEventMessage
  | RunnerStatusMessage
  | RunnerAgentSessionMessage
  | RunnerChangesMessage
  | RunnerPublishResultMessage;

// --- Server -> Runner ---

export type RunInstructionMessage = {
  type: "run_instruction";
  text: string;
  /** The agent's own session id, to continue a conversation across instructions. */
  resume?: string;
};

export type StopRunMessage = { type: "stop_run" };

export type RequestRunnerChangesMessage = {
  type: "request_runner_changes";
  requestId: string;
};

export type RunPublishMessage = { type: "run_publish"; title: string };

// The reply to runner_hello. Without an explicit one, a runner cannot tell
// "attached" from "rejected and about to be closed" — both look like an open
// socket — so a bad token produces a reconnect loop that never backs off and
// never says why.
export type RunnerReadyMessage = { type: "runner_ready" };

/** `fatal` means the token will never work; retrying is pointless. */
export type RunnerRejectedMessage = {
  type: "runner_rejected";
  reason: string;
  fatal: boolean;
};

export type ServerToRunnerMessage =
  | RunInstructionMessage
  | StopRunMessage
  | RequestRunnerChangesMessage
  | RunPublishMessage
  | RunnerReadyMessage
  | RunnerRejectedMessage;

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
 * What will run on the next instruction, and on whose credentials — reported
 * by the runner at `runner_hello` and fixed for its process lifetime. A
 * browser can't change any of it: the host's machine holds the credentials,
 * so it's the one that always pays.
 */
export type AgentInfo = {
  /** `mock` is the scripted offline agent; `real` runs the Agent SDK. */
  mode: "mock" | "real";
  keySource: "oauth" | "api-key" | "mock";
  /** Last four characters of the key, when the runner was launched with one. */
  keyHint: string | null;
  /** Without an attached runner, nothing can execute an instruction. */
  runnerConnected: boolean;
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
  files: ChangedFile[];
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
  | ControlRequestCancelledMessage
  | SuggestionsMessage;
