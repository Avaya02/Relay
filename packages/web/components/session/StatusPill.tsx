"use client";

import { useSyncExternalStore } from "react";
import type { SessionStatus } from "@relay/shared";

const LABEL: Record<SessionStatus, string> = {
  idle: "Idle",
  working: "Working",
  done: "Done",
  error: "Error",
};

// A one-second clock as an external store, so the elapsed counter re-renders
// on a tick rather than by writing state from an effect.
function subscribe(cb: () => void): () => void {
  const t = setInterval(cb, 1000);
  return () => clearInterval(t);
}
const second = () => Math.floor(Date.now() / 1000);

function elapsed(sinceMs: number, nowS: number): string {
  const s = Math.max(0, nowS - Math.floor(sinceMs / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The session's state, with how long the current run has been going. The
 * clock is the honest liveness signal: a pulsing dot says "something is
 * happening", a counter that keeps moving says "and it's this one".
 */
export function StatusPill({
  status,
  workingSince,
}: {
  status: SessionStatus;
  /** ISO time of the instruction that started the current run. */
  workingSince: string | null;
}) {
  const ticking = status === "working" && workingSince !== null;
  const nowS = useSyncExternalStore(ticking ? subscribe : () => () => {}, second, second);

  return (
    <span className={`pill pill--${status}`} role="status">
      <span className="pill-dot" aria-hidden />
      {LABEL[status]}
      {ticking && <span className="pill-meta">{elapsed(Date.parse(workingSince), nowS)}</span>}
    </span>
  );
}
