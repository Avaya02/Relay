"use client";

import { useState } from "react";
import type { Participant } from "@relay/shared";

// Past this many, show an overflow toggle instead of letting the bar keep
// growing — at 8 participants the un-truncated list clips on desktop and
// forces horizontal scroll on mobile (measured: 675px of content in a 375px
// viewport).
const VISIBLE_LIMIT = 4;

const PRESENCE_COLORS = [
  "var(--presence-1)",
  "var(--presence-2)",
  "var(--presence-3)",
  "var(--presence-4)",
];

// Stable per participant regardless of join/leave order elsewhere in the
// list — hashing the id (rather than array index) means nobody's dot
// changes color just because someone else disconnected.
function colorFor(participantId: string): string {
  let hash = 0;
  for (let i = 0; i < participantId.length; i++) {
    hash = (hash * 31 + participantId.charCodeAt(i)) | 0;
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

export function Presence({
  participants,
  driverId,
  selfId,
}: {
  participants: Participant[];
  driverId: string | null;
  selfId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  // The driver sorts first: it's the one identity that changes what everyone
  // else can do, so it must survive both the +N cut and the mobile
  // name-collapse (see .presence-item--driver in globals.css).
  const ordered = [...participants].sort((a, b) => {
    if (a.id === driverId) return -1;
    if (b.id === driverId) return 1;
    return 0;
  });

  const overflow = ordered.length - VISIBLE_LIMIT;
  const visible =
    overflow > 0 && !expanded ? ordered.slice(0, VISIBLE_LIMIT) : ordered;

  return (
    <div className={expanded ? "presence presence--expanded" : "presence"}>
      {visible.map((p) => {
        const isDriving = p.id === driverId;
        const label = p.id === selfId ? "you" : p.displayName;
        return (
          <span
            key={p.id}
            className={
              isDriving ? "presence-item presence-item--driver" : "presence-item"
            }
            title={isDriving ? `${p.displayName} — driving` : p.displayName}
          >
            <span
              className="presence-dot"
              style={{ backgroundColor: colorFor(p.id) }}
              aria-hidden
            />
            <span className="presence-name">{label}</span>
            {isDriving && <span className="presence-driving">driving</span>}
          </span>
        );
      })}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? "show fewer participants"
              : `${overflow} more participants`
          }
          className="presence-more"
        >
          {expanded ? "less" : `+${overflow}`}
        </button>
      )}
    </div>
  );
}
