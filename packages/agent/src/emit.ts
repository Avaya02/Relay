import type { EventKind, SessionStatus } from "@relay/shared";

/**
 * How a run reports what it is doing.
 *
 * Indirection instead of a direct server call: the agent runs on the host's
 * own machine, so this has to go out over a socket. Also keeps runs testable
 * without a server at all.
 */
export type RunEmitter = {
  event(kind: EventKind, data: Record<string, unknown>): void;
  status(status: SessionStatus): void;
  /** The SDK's own session id, so the next instruction can resume this conversation. */
  agentSession(id: string): void;
};
