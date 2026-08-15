"use client";

import { use, useState, type FormEvent } from "react";
import { useSession } from "@/lib/useSession";
import { StreamView } from "@/components/StreamView";
import { Composer } from "@/components/Composer";
import { Presence } from "@/components/Presence";
import { ControlBar } from "@/components/ControlBar";
import { SessionChanges } from "@/components/SessionChanges";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const session = useSession(sessionId);
  const [attemptedJoin, setAttemptedJoin] = useState(false);

  // Gated on selfId, not a local flag: selfId only becomes non-null once the
  // server actually confirms the join with a `joined` message. That way a
  // failed join (e.g. the session died in a server restart, since state is
  // in-memory only) keeps showing the join screen — and its error — instead
  // of silently rendering an empty "joined" view with no real session behind
  // it.
  if (session.selfId === null) {
    return (
      <JoinGate
        sessionId={sessionId}
        connection={session.connection}
        lastError={session.lastError}
        joining={attemptedJoin}
        onJoin={(name) => {
          session.join(name);
          setAttemptedJoin(true);
        }}
      />
    );
  }

  const isDriver = session.selfId !== null && session.selfId === session.driverId;

  return (
    <div className="flex h-screen min-h-0 flex-col bg-[var(--bg)]">
      <Header sessionId={sessionId} session={session} />
      <StreamView
        events={session.events}
        participants={session.participants}
        selfId={session.selfId}
      />
      {session.connection === "open" ? (
        <>
          <SessionChanges
            changes={session.changes}
            isDriver={isDriver}
            publishState={session.publishState}
            publishing={session.publishing}
            onPublish={session.publish}
          />
          <ControlBar
            participants={session.participants}
            driverId={session.driverId}
            selfId={session.selfId}
            pendingRequests={session.pendingRequests}
            onRequestControl={session.requestControl}
            onHandOver={session.handOver}
            onRelease={session.releaseControl}
          />
          {isDriver && <Composer onSend={(text) => session.instruct(text)} />}
        </>
      ) : (
        // No auto-reconnect yet — the honest recovery action is a reload,
        // which re-joins and replays history via the existing catch-up path.
        // Replacing (not just supplementing) the control bar here matters:
        // driving or requesting control while the socket is dead would
        // silently no-op, same as sending an instruction does today.
        <div className="border-t border-[var(--state-error)] bg-[var(--surface-2)] px-4 py-3 text-center font-mono text-xs text-[var(--state-error)]">
          Disconnected from the session — reload the page to reconnect.
        </div>
      )}
    </div>
  );
}

function JoinGate({
  sessionId,
  connection,
  lastError,
  joining,
  onJoin,
}: {
  sessionId: string;
  connection: string;
  lastError: string | null;
  joining: boolean;
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
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your name"
            className="h-9 bg-[var(--surface-2)] text-sm"
          />
          <Button
            type="submit"
            disabled={!name.trim() || (joining && !lastError)}
            className="h-9"
          >
            {joining && !lastError ? "Joining…" : "Join"}
          </Button>
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
        <span className="font-heading text-base font-medium text-[var(--text)]">
          relay
        </span>
        <span className="font-mono text-xs text-[var(--text-dim)]">
          {sessionId}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <StatusBadge status={session.status} />
        <Presence
          participants={session.participants}
          driverId={session.driverId}
          selfId={session.selfId}
        />
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
