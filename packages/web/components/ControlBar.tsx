"use client";

import { useState } from "react";
import type { Participant } from "@relay/shared";
import { Button } from "@/components/ui/button";

export function ControlBar({
  participants,
  driverId,
  selfId,
  pendingRequests,
  onRequestControl,
  onHandOver,
  onRelease,
}: {
  participants: Participant[];
  driverId: string | null;
  selfId: string | null;
  pendingRequests: Participant[];
  onRequestControl: () => void;
  onHandOver: (toParticipantId: string) => void;
  onRelease: () => void;
}) {
  const isDriver = selfId !== null && selfId === driverId;

  if (isDriver) {
    const others = participants.filter((p) => p.id !== selfId);
    if (others.length === 0) return null;

    return (
      <div className="flex flex-col gap-1.5 border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5">
        {others.map((p) => {
          const isRequesting = pendingRequests.some((r) => r.id === p.id);
          return (
            <div key={p.id} className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-[var(--text-dim)]">
                {p.displayName}
                {isRequesting && (
                  <span className="ml-2 text-[var(--accent)]">
                    requesting control
                  </span>
                )}
              </span>
              <Button
                variant={isRequesting ? "default" : "outline"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => onHandOver(p.id)}
              >
                Hand over
              </Button>
            </div>
          );
        })}
        <button
          onClick={onRelease}
          className="self-start font-mono text-xs text-[var(--text-dim)] underline-offset-2 hover:text-[var(--text)] hover:underline"
        >
          Release
        </button>
      </div>
    );
  }

  const driver = participants.find((p) => p.id === driverId) ?? null;
  return (
    // Keyed on driverId so "requested — waiting" resets by remounting
    // whenever the lock actually moves, instead of syncing local state to
    // a prop change inside an effect.
    <RequestBar
      key={driverId ?? "none"}
      driver={driver}
      onRequestControl={onRequestControl}
    />
  );
}

function RequestBar({
  driver,
  onRequestControl,
}: {
  driver: Participant | null;
  onRequestControl: () => void;
}) {
  const [requested, setRequested] = useState(false);

  return (
    <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
      <span className="text-sm text-[var(--text-dim)]">
        {driver ? (
          <>
            <span className="text-[var(--text)]">{driver.displayName}</span>{" "}
            is driving
          </>
        ) : (
          "Nobody's driving"
        )}
      </span>
      <Button
        size="sm"
        className="h-8 px-3 text-xs"
        disabled={requested}
        onClick={() => {
          setRequested(true);
          onRequestControl();
        }}
      >
        {requested
          ? `Requested — waiting for ${driver?.displayName ?? "a driver"}`
          : driver
            ? "Request control"
            : "Take control"}
      </Button>
    </div>
  );
}
