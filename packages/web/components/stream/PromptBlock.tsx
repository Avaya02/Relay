"use client";

import type { Event, Participant } from "@relay/shared";
import { Avatar } from "@/components/Presence";
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
  const author = participants.find((p) => p.id === event.by) ?? null;
  const name = event.by === selfId ? "you" : (author?.displayName ?? "someone");

  return (
    <div className="prompt" data-new={isNew || undefined}>
      <div className="prompt-meta">
        {author ? (
          <Avatar participant={author} />
        ) : (
          <Avatar participant={{ id: event.by ?? "?", displayName: name }} />
        )}
        <span className="prompt-who">{name}</span>
        <span>{timeOf(event)}</span>
        {queued && <span className="prompt-queued">queued</span>}
        {dropped && <span>not run</span>}
        <span className="prompt-turn">turn {number}</span>
      </div>
      <p className="prompt-text">{String(event.data.text ?? "")}</p>
    </div>
  );
}
