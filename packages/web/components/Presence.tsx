"use client";

import type { Participant } from "@relay/shared";
import { colorFor, initials } from "@/lib/presence";
import { Popover } from "@/components/session/Popover";

// Past this many, the stack ends in a +N that opens the full list — at eight
// participants the un-truncated row overflowed a phone header.
const VISIBLE_LIMIT = 4;

export function Avatar({
  participant,
  driving = false,
  requesting = false,
  title,
}: {
  participant: Participant;
  driving?: boolean;
  requesting?: boolean;
  title?: string;
}) {
  return (
    <span
      className={`avatar${driving ? " avatar--driver" : ""}${
        requesting ? " avatar--requesting" : ""
      }`}
      style={{ "--presence": colorFor(participant.id) } as React.CSSProperties}
      title={title ?? participant.displayName}
      aria-hidden
    >
      {initials(participant.displayName)}
    </span>
  );
}

export function Presence({
  participants,
  driverId,
  selfId,
  pendingRequests = [],
}: {
  participants: Participant[];
  driverId: string | null;
  selfId: string | null;
  pendingRequests?: Participant[];
}) {
  // The driver sorts first: it's the one identity that changes what everyone
  // else can do, so it survives the +N cut.
  const ordered = [...participants].sort((a, b) => {
    if (a.id === driverId) return -1;
    if (b.id === driverId) return 1;
    return 0;
  });
  const requesting = new Set(pendingRequests.map((p) => p.id));
  const overflow = ordered.length - VISIBLE_LIMIT;
  const visible = overflow > 0 ? ordered.slice(0, VISIBLE_LIMIT) : ordered;
  const driver = participants.find((p) => p.id === driverId) ?? null;

  const nameOf = (p: Participant) => (p.id === selfId ? "you" : p.displayName);
  const roleOf = (p: Participant) =>
    p.id === driverId ? "driving" : requesting.has(p.id) ? "asking to drive" : "watching";

  return (
    <div className="presence">
      <ul className="avatars" aria-label={`${participants.length} in the room`}>
        {visible.map((p) => (
          <li key={p.id} style={{ display: "contents" }}>
            <Avatar
              participant={p}
              driving={p.id === driverId}
              requesting={requesting.has(p.id)}
              title={`${nameOf(p)} — ${roleOf(p)}`}
            />
            <span className="sr-only">
              {nameOf(p)}, {roleOf(p)}
            </span>
          </li>
        ))}
      </ul>
      {overflow > 0 && (
        <Popover
          label="Everyone in the room"
          width="15rem"
          trigger={(props) => (
            <button type="button" className="presence-more" {...props}>
              +{overflow}
            </button>
          )}
        >
          <p className="popover-title">In the room</p>
          <ul className="presence-list">
            {ordered.map((p) => (
              <li key={p.id}>
                <Avatar participant={p} driving={p.id === driverId} />
                {nameOf(p)}
                <span
                  className={`presence-list-role${
                    p.id === driverId ? " presence-list-role--driving" : ""
                  }`}
                >
                  {roleOf(p)}
                </span>
              </li>
            ))}
          </ul>
        </Popover>
      )}
      {driver && (
        <span className="presence-driver">
          <strong>{nameOf(driver)}</strong>
          <span className="presence-driver-tag">driving</span>
        </span>
      )}
    </div>
  );
}
