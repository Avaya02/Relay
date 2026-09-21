"use client";

import { useState } from "react";
import { ChevronDown, Hand } from "lucide-react";
import type { Participant } from "@relay/shared";

/**
 * Who holds the wheel, and the one-click answers to it. Renders the driver's
 * controls or the viewer's from the same props, which is what lets the
 * landing page's lock section drop the real thing into both of its screens.
 */
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
    // Driving alone: nobody to hand to and nothing to release to, so the
    // strip would be chrome around a dead control.
    if (others.length === 0) return null;

    return (
      <div className="control">
        {pendingRequests.map((p) => (
          <div key={p.id} className="control-request">
            <span className="control-request-who">
              <Hand size={13} />
              {p.displayName} is asking to drive
            </span>
            <button
              type="button"
              className="chrome-btn chrome-btn--primary"
              onClick={() => onHandOver(p.id)}
            >
              Hand over
            </button>
          </div>
        ))}

        <div className="control-row">
          <span className="control-status">
            <span className="control-dot" aria-hidden />
            <strong>You&rsquo;re driving</strong>
            <span className="control-status-detail">
              · {others.length} watching
            </span>
          </span>
          <div className="control-actions">
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
    // Keyed on driverId so "requested — waiting" resets by remounting when
    // the lock actually moves, instead of syncing local state in an effect.
    <RequestBar
      key={driverId ?? "none"}
      driver={driver}
      onRequestControl={onRequestControl}
      onCancelRequest={onCancelRequest}
    />
  );
}

// A themed native <select>: its popup can never be clipped by the scrolling
// stream above it, and it is keyboard- and screen-reader-complete for free.
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
          Hand over
        </option>
        {others.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName}
          </option>
        ))}
      </select>
      <ChevronDown size={13} aria-hidden />
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
          <span
            className={`control-dot${driver ? "" : " control-dot--idle"}`}
            aria-hidden
          />
          {driver ? (
            <>
              <strong>{driver.displayName}</strong> is driving
              <span className="control-status-detail"> · you&rsquo;re watching</span>
            </>
          ) : (
            "Nobody's driving"
          )}
        </span>

        {requested ? (
          <div className="control-actions">
            <span className="control-status">
              Waiting for {driver?.displayName ?? "a driver"}…
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
          <button
            type="button"
            className={`chrome-btn${driver ? "" : " chrome-btn--primary"}`}
            onClick={() => {
              setRequested(true);
              onRequestControl();
            }}
          >
            {driver ? "Request control" : "Take control"}
          </button>
        )}
      </div>
    </div>
  );
}
