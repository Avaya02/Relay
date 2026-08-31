import type { EventKind, SessionStatus } from "@relay/shared";

/**
 * How a run reports what it is doing.
 *
 * The agent implementations used to call the server's appendEvent/setStatus
 * directly, which only worked while they shared its process. Going through
 * this instead is what lets them run on the host's machine and report over a
 * socket — and it keeps them testable without a server at all.
 */
export type RunEmitter = {
  event(kind: EventKind, data: Record<string, unknown>): void;
  status(status: SessionStatus): void;
  /** The SDK's own session id, so the next instruction can resume this conversation. */
  agentSession(id: string): void;
};
