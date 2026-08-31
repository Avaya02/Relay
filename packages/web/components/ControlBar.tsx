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
  onCancelRequest,
  onHandOver,
  onRelease,
}: {
  participants: Participant[];
  driverId: string | null;
  selfId: string | null;
  pendingRequests: Participant[];
  onRequestControl: () => void;
  onCancelRequest: () => void;
  onHandOver: (toParticipantId: string) => void;
  onRelease: () => void;
}) {
  const isDriver = selfId !== null && selfId === driverId;

  if (isDriver) {
    const others = participants.filter((p) => p.id !== selfId);
    // Driving alone: there is nobody to hand to and nothing to release to,
    // so the bar would be pure chrome around a dead control.
    if (others.length === 0) return null;

    return (
      <div className="control">
        {/* Pending requesters get promoted to their own row — that's the
            one case here that genuinely needs a one-click answer. */}
        {pendingRequests.map((p) => (
          <div key={p.id} className="control-request">
            <span className="control-request-who">
              {p.displayName} is asking to drive
            </span>
            <Button
              size="sm"
              className="h-6 px-2.5 text-xs"
              onClick={() => onHandOver(p.id)}
            >
              Hand over
            </Button>
          </div>
        ))}

        <div className="control-row">
          <span className="control-status">
            <strong>You&rsquo;re driving</strong>
            {/* Dropped rather than ellipsised at narrow widths — a clipped
                "· 3 people …" is worse than not saying it, and the header's
                presence list already carries the same count. */}
            <span className="control-status-detail">
              {" "}
              · {others.length} watching
            </span>
          </span>
          <div className="flex items-center gap-3">
            <HandOverMenu others={others} onHandOver={onHandOver} />
            <button type="button" onClick={onRelease} className="control-link">
              Release
            </button>
          </div>
        </div>
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
      onCancelRequest={onCancelRequest}
    />
  );
}

// A themed native <select> rather than a custom menu: the native popup can
// never be clipped by the scrolling ledger above it, and it is keyboard- and
// screen-reader-complete for free. Styling lives in globals.css (.select).
function HandOverMenu({
  others,
  onHandOver,
}: {
  others: Participant[];
  onHandOver: (toParticipantId: string) => void;
}) {
  return (
    <span className="select">
      <select
        value=""
        onChange={(e) => {
          const id = e.target.value;
          if (id) onHandOver(id);
          e.target.value = "";
        }}
        aria-label="Hand over control to"
      >
        <option value="" disabled>
          Hand over…
        </option>
        {others.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName}
          </option>
        ))}
      </select>
    </span>
  );
}

function RequestBar({
  driver,
  onRequestControl,
  onCancelRequest,
}: {
  driver: Participant | null;
  onRequestControl: () => void;
  onCancelRequest: () => void;
}) {
  const [requested, setRequested] = useState(false);

  return (
    <div className="control">
      <div className="control-row">
        <span className="control-status">
          {driver ? (
            <>
              <strong>{driver.displayName}</strong> is driving
              <span className="control-status-detail"> — you&rsquo;re watching</span>
            </>
          ) : (
            "Nobody's driving"
          )}
        </span>

        {requested ? (
          <div className="flex items-center gap-3">
            <span className="control-request-who">
              Waiting for {driver?.displayName ?? "a driver"}
            </span>
            <button
              type="button"
              onClick={() => {
                setRequested(false);
                onCancelRequest();
              }}
              className="control-link"
            >
              Cancel
            </button>
          </div>
        ) : (
          <Button
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => {
              setRequested(true);
              onRequestControl();
            }}
          >
            {driver ? "Request control" : "Take control"}
          </Button>
        )}
      </div>
    </div>
  );
}
