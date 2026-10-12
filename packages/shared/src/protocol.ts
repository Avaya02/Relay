export type SessionStatus = "idle" | "working" | "done" | "error";

export type Participant = {
  id: string;
  displayName: string;
};

export type EventKind =
  | "user_instruction"
  | "agent_text"
  | "tool_call"
  | "tool_result"
  | "agent_done"
  | "agent_error";

export type Event = {
  // Per session, assigned server-side only.
  seq: number;
  ts: string;
  kind: EventKind;
  by?: string;
  data: Record<string, unknown>;
};

export type ToolDetail =
  | { type: "diff"; path: string; lines: DiffLine[] }
  | { type: "text"; text: string }
  | { type: "plan"; todos: PlanItem[] };

export type DiffLine = { op: " " | "-" | "+"; text: string };

// State, not a log: clients take the newest plan in the transcript, so replay
// and late joins need no extra protocol.
export type PlanItem = {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
};

export type ChangedFile = {
  path: string;
  insertions: number;
  deletions: number;
};

// `id` pairs a call with its result so the client renders one row per action.
export type ToolCallData = {
  id: string;
  tool: string;
  verb: string;
  target: string;
  detail?: ToolDetail;
};

export type ToolResultData = {
  id: string;
  tool: string;
  ok: boolean;
  summary: string;
  detail?: ToolDetail;
};

export type AgentDoneData = {
  steps?: number;
  durationMs?: number;
  costUsd?: number;
};

export type JoinMessage = {
  type: "join";
  sessionId: string;
  displayName: string;
  // Reconnect only: reattaches to the same participant, keeping the driver seat.
  resumeToken?: string;
};

export type InstructMessage = {
  type: "instruct";
  text: string;
};

// Also drops anything queued behind the in-flight run.
export type StopMessage = { type: "stop" };

export type CancelRequestMessage = { type: "cancel_request" };

export type PingMessage = { type: "ping" };

// Granted immediately when nobody is driving.
export type RequestControlMessage = { type: "request_control" };

export type HandOverMessage = {
  type: "hand_over";
  toParticipantId: string;
};

export type ReleaseControlMessage = { type: "release_control" };

export type RequestChangesMessage = { type: "request_changes" };

export type PublishMessage = { type: "publish"; title: string };

export type Suggestion = {
  id: string;
  text: string;
  // May have since left the room.
  by: string;
  displayName: string;
  ts: string;
};

export type SuggestMessage = { type: "suggest"; text: string };

export type PromoteSuggestionMessage = { type: "promote_suggestion"; id: string };

export type DismissSuggestionMessage = { type: "dismiss_suggestion"; id: string };

// The whole list is re-sent on every change; it is capped (MAX_SUGGESTIONS).
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

// `token` is minted by POST /sessions; holding it means acting as the room's runner.
export type RunnerHelloMessage = {
  type: "runner_hello";
  sessionId: string;
  token: string;
  repoName: string | null;
  mode: "mock" | "real";
  keySource: "oauth" | "api-key" | "mock";
  keyHint: string | null;
  // Optional so older CLIs still connect.
  model?: string;
  // The server drops the conversation id on every runner disconnect; only the
  // runner knows whether its clone survived (wifi blip) and can offer it back.
  resumeAgentSession?: string;
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

export type RunInstructionMessage = {
  type: "run_instruction";
  text: string;
  resume?: string;
};

export type StopRunMessage = { type: "stop_run" };

export type RequestRunnerChangesMessage = {
  type: "request_runner_changes";
  requestId: string;
};

export type RunPublishMessage = { type: "run_publish"; title: string };

// Without an explicit ack, "attached" and "rejected, about to close" look the
// same to the runner, producing a reconnect loop that never backs off.
export type RunnerReadyMessage = { type: "runner_ready" };

// `fatal`: retrying can't help.
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

export type JoinedMessage = {
  type: "joined";
  participantId: string;
  // Sent back as JoinMessage.resumeToken; losing it just means rejoining as a new person.
  token: string;
};

// Sent instead of `joined`/`history` for a dead session: no participant identity.
export type ReplayMessage = {
  type: "replay";
  status: SessionStatus;
  driverId: string | null;
  events: Event[];
};

// Runner-reported at hello; browsers can't change it because the host holds the credentials.
export type AgentInfo = {
  mode: "mock" | "real";
  keySource: "oauth" | "api-key" | "mock";
  // Last four characters only.
  keyHint: string | null;
  // Null in mock mode or for a runner too old to report one.
  model: string | null;
  runnerConnected: boolean;
};

export type SessionStateMessage = {
  type: "session_state";
  participants: Participant[];
  driverId: string | null;
  status: SessionStatus;
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

export type ControlChangedMessage = {
  type: "control_changed";
  driverId: string | null;
};

// Driver only.
export type ControlRequestedMessage = {
  type: "control_requested";
  participantId: string;
  displayName: string;
};

export type ControlRequestCancelledMessage = {
  type: "control_request_cancelled";
  participantId: string;
};

// Cumulative for the session, sent to whoever asked.
export type SessionChangesMessage = {
  type: "session_changes";
  files: ChangedFile[];
  insertions: number;
  deletions: number;
  patch: string;
};

// `ok: true` with `pushed: false` is a success: the branch landed locally and no
// GitHub repo/token is configured.
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
