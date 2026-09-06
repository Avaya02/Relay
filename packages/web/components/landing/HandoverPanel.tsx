"use client";

import type { Participant } from "@relay/shared";
import { Presence } from "@/components/Presence";
import { ControlBar } from "@/components/ControlBar";

// The lock section made the argument in prose and showed nothing, which left
// the page's one differentiator as the only claim with no evidence behind it.
//
// This renders the real Presence and ControlBar against fixture props rather
// than a picture of them: both are pure presentational components, so the
// landing page can show the actual control surface for the cost of some data.
// A screenshot would go stale the next time either component changes; this
// cannot.

const PARTICIPANTS: Participant[] = [
  { id: "p-avi", displayName: "avi" },
  { id: "p-sam", displayName: "sam" },
  { id: "p-noor", displayName: "noor" },
];

// Frozen at the one moment worth showing: sam holds the wheel, noor has asked
// for it, and the grant is one click away. Every other state is a quieter
// version of this one.
const DRIVER = "p-sam";
const SELF = "p-sam";
const PENDING = [PARTICIPANTS[2]];

const noop = () => {};

export function HandoverPanel() {
  return (
    <div className="handover" aria-hidden>
      <div className="handover-chrome">
        <span className="handover-mark">relay</span>
        <Presence participants={PARTICIPANTS} driverId={DRIVER} selfId={SELF} />
      </div>
      <div className="handover-body">
        <ControlBar
          participants={PARTICIPANTS}
          driverId={DRIVER}
          selfId={SELF}
          pendingRequests={PENDING}
          onRequestControl={noop}
          onCancelRequest={noop}
          onHandOver={noop}
          onRelease={noop}
        />
      </div>
    </div>
  );
}
