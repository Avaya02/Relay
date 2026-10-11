"use client";

import type { CSSProperties } from "react";
import type { Event, Participant } from "@relay/shared";
import { PresenceAvatar } from "@/components/room/PresenceAvatar";
import { useHue } from "@/components/room/hues";
import { timeOf } from "./rows";
import { useIsNew } from "./newRows";

export function PromptBlock({
  event,
  number,
  participants,
  selfId,
  queued,
  dropped,
}: {
  event: Event;
  number: number;
  participants: Participant[];
  selfId: string | null;
  queued: boolean;
  /** Accepted, then never run — the room stopped the agent first. */
  dropped: boolean;
}) {
  const isNew = useIsNew(event.seq);
  const hue = useHue();
  const by = event.by ?? "";
  const author = participants.find((p) => p.id === event.by) ?? null;
  // The transcript outlives the room: whoever sent this may have left.
  const name = event.by === selfId ? "You" : (author?.displayName ?? "Someone");

  return (
    <div
      className="prompt"
      data-new={isNew || undefined}
      style={{ "--hue": hue(by) } as CSSProperties}
    >
      <div className="prompt-meta">
        <PresenceAvatar participant={{ displayName: author?.displayName ?? "?" }} hue={hue(by)} size="xs" />
        <span className="prompt-who">{name}</span>
        <span className="prompt-time">{timeOf(event)}</span>
        {queued && <span className="prompt-tag">Queued</span>}
        {dropped && <span className="prompt-tag">Not run</span>}
        <span className="prompt-turn">Turn {number}</span>
      </div>
      <p className="prompt-text">{String(event.data.text ?? "")}</p>
    </div>
  );
}
