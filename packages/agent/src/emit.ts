import type { EventKind, SessionStatus } from "@relay/shared";

export type RunEmitter = {
  event(kind: EventKind, data: Record<string, unknown>): void;
  status(status: SessionStatus): void;
  agentSession(id: string): void;
};
