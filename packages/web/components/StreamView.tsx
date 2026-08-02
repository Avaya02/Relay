"use client";

import { useEffect, useRef } from "react";
import type { Event, Participant } from "@relay/shared";

export function StreamView({
  events,
  participants,
  selfId,
}: {
  events: Event[];
  participants: Participant[];
  selfId: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [events.length]);

  return (
    <main className="flex-1 overflow-y-auto px-4 py-4">
      {events.length === 0 && (
        <p className="text-sm text-[var(--text-dim)]">
          Nothing running yet — type an instruction to start.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {events.map((event) => (
          <EventRow
            key={event.seq}
            event={event}
            participants={participants}
            selfId={selfId}
          />
        ))}
      </div>
      <div ref={bottomRef} />
    </main>
  );
}

function EventRow({
  event,
  participants,
  selfId,
}: {
  event: Event;
  participants: Participant[];
  selfId: string | null;
}) {
  const time = new Date(event.ts).toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  if (event.kind === "user_instruction") {
    const name =
      event.by === selfId
        ? "you"
        : (participants.find((p) => p.id === event.by)?.displayName ?? "someone");
    return (
      <div className="text-sm text-[var(--text)]">
        <span className="text-[var(--text-dim)]">{name} → </span>
        {String(event.data.text)}
      </div>
    );
  }

  if (event.kind === "agent_text") {
    return (
      <p className="text-sm leading-relaxed text-[var(--text)]">
        {String(event.data.text)}
      </p>
    );
  }

  if (event.kind === "tool_call" || event.kind === "tool_result") {
    const isResult = event.kind === "tool_result";
    const summary = String(event.data.summary);
    const ok = event.data.ok;
    const marker = isResult ? (ok ? "✓" : "✗") : "▸";
    return (
      <div className="flex items-baseline justify-between gap-4 border-l-2 border-[var(--border)] pl-3 font-mono text-xs text-[var(--text-dim)]">
        <span>
          <span className="text-[var(--text)]">{marker} </span>
          {summary}
        </span>
        <span className="shrink-0 text-[var(--text-dim)]">{time}</span>
      </div>
    );
  }

  if (event.kind === "agent_done") {
    return (
      <div className="pl-3 font-mono text-xs text-[var(--text-dim)]">
        — done —
      </div>
    );
  }

  if (event.kind === "agent_error") {
    return (
      <div className="border-l-2 border-[var(--state-error)] pl-3 font-mono text-xs text-[var(--state-error)]">
        {String(event.data.message ?? "agent error")}
      </div>
    );
  }

  return null;
}
