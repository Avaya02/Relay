"use client";

import { useSyncExternalStore } from "react";
import { Check, Unplug, X } from "lucide-react";
import type { SessionStatus } from "@relay/shared";

// One-second clock as an external store, so no state is written from an effect.
function subscribe(cb: () => void): () => void {
  const t = setInterval(cb, 1000);
  return () => clearInterval(t);
}
const second = () => Math.floor(Date.now() / 1000);

function elapsed(sinceMs: number, nowS: number): string {
  const s = Math.max(0, nowS - Math.floor(sinceMs / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Kind = SessionStatus | "offline" | "ended";

const LABEL: Record<Kind, string> = {
  idle: "Ready",
  working: "Working",
  done: "Done",
  error: "Error",
  offline: "Agent offline",
  ended: "Ended",
};

// A dropped runner outranks the run's status: "Working" with nobody attached would be a lie.
export function StatusBadge({
  status,
  workingSince,
  offline,
  ended = false,
}: {
  status: SessionStatus;
  workingSince: string | null;
  offline: boolean;
  ended?: boolean;
}) {
  const kind: Kind = ended ? "ended" : offline ? "offline" : status;
  const ticking = kind === "working" && workingSince !== null;
  const nowS = useSyncExternalStore(ticking ? subscribe : () => () => {}, second, second);

  return (
    <span className="rstatus" data-kind={kind} role="status">
      {kind === "done" ? (
        <Check size={13} strokeWidth={2.5} aria-hidden />
      ) : kind === "error" ? (
        <X size={13} strokeWidth={2.5} aria-hidden />
      ) : kind === "offline" ? (
        <Unplug size={13} aria-hidden />
      ) : (
        <span className="rstatus-dot" aria-hidden />
      )}
      <span className="rstatus-label">{LABEL[kind]}</span>
      {ticking && <span className="rstatus-time">{elapsed(Date.parse(workingSince), nowS)}</span>}
    </span>
  );
}
