"use client";

import { use, useEffect, useRef, useState, type FormEvent } from "react";
import type { Event, Participant } from "@relay/shared";
import { useSession } from "@/lib/useSession";

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const session = useSession(sessionId);
  const [hasJoined, setHasJoined] = useState(false);

  if (!hasJoined) {
    return (
      <JoinGate
        sessionId={sessionId}
        connection={session.connection}
        lastError={session.lastError}
        onJoin={(name) => {
          session.join(name);
          setHasJoined(true);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      <Header sessionId={sessionId} session={session} />
      <EventStream events={session.events} participants={session.participants} selfId={session.selfId} />
      <Composer onSend={(text) => session.instruct(text)} />
    </div>
  );
}

function JoinGate({
  sessionId,
  connection,
  lastError,
  onJoin,
}: {
  sessionId: string;
  connection: string;
  lastError: string | null;
  onJoin: (displayName: string) => void;
}) {
  const [name, setName] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onJoin(trimmed);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bg)] px-6">
      <div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="mb-1 text-lg font-semibold text-[var(--text)]">
          Join session
        </h1>
        <p className="mb-5 font-mono text-xs text-[var(--text-dim)]">
          {sessionId}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your name"
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--bg)] transition-opacity disabled:opacity-40"
          >
            Join
          </button>
        </form>
        {connection === "connecting" && (
          <p className="mt-4 font-mono text-xs text-[var(--text-dim)]">
            connecting…
          </p>
        )}
        {connection === "error" && (
          <p className="mt-4 font-mono text-xs text-[var(--state-error)]">
            could not reach the server
          </p>
        )}
        {lastError && (
          <p className="mt-4 font-mono text-xs text-[var(--state-error)]">
            {lastError}
          </p>
        )}
      </div>
    </div>
  );
}

function Header({
  sessionId,
  session,
}: {
  sessionId: string;
  session: ReturnType<typeof useSession>;
}) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-[var(--text)]">relay</span>
        <span className="font-mono text-xs text-[var(--text-dim)]">
          {sessionId}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <StatusBadge status={session.status} />
        <div className="flex items-center gap-2">
          {session.participants.map((p) => (
            <span
              key={p.id}
              className="font-mono text-xs text-[var(--text-dim)]"
              title={p.id === session.driverId ? `${p.displayName} (driving)` : p.displayName}
            >
              ● {p.id === session.selfId ? "you" : p.displayName}
              {p.id === session.driverId ? " (driving)" : ""}
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "working"
      ? "text-[var(--accent)]"
      : status === "error"
        ? "text-[var(--state-error)]"
        : "text-[var(--text-dim)]";
  return <span className={`font-mono text-xs ${color}`}>{status}</span>;
}

function EventStream({
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

function Composer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-2 border-t border-[var(--border)] bg-[var(--surface-2)] p-3"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type an instruction…"
        className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--bg)] transition-opacity disabled:opacity-40"
      >
        Send
      </button>
    </form>
  );
}
