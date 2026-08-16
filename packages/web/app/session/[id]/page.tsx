"use client";

import { use, useState, type FormEvent } from "react";
import Link from "next/link";
import type { SessionStatus } from "@relay/shared";
import { useSession, type ReplayedSession } from "@/lib/useSession";
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

  // Checked before the join gate: a session that isn't live but whose
  // transcript survived a restart replies to `join` with `replay` instead
  // of `joined` (spec §6.5's read-only replay), and there's no participant
  // identity to gate on in that mode.
  if (session.replayed) {
    return <ReplayView sessionId={sessionId} replayed={session.replayed} />;
  }

  // Gated on selfId, not a local flag: selfId only becomes non-null once the
  // server actually confirms the join with a `joined` message. That way a
  // failed join (e.g. the session doesn't exist at all) keeps showing the
  // join screen — and its error — instead of silently rendering an empty
  // "joined" view with no real session behind it.
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
  const driver =
    session.participants.find((p) => p.id === session.driverId) ?? null;

  return (
    <div className="flex h-screen min-h-0 flex-col bg-[var(--bg)]">
      <header className="chrome-bar">
        <div className="chrome-mark">
          <span className="chrome-wordmark">relay</span>
          <span className="chrome-session-id">{sessionId}</span>
        </div>
        <div className="chrome-right">
          <StatusBadge status={session.status} />
          <span className="chrome-divider" aria-hidden />
          <Presence
            participants={session.participants}
            driverId={session.driverId}
            selfId={session.selfId}
          />
        </div>
      </header>

      <StreamView
        events={session.events}
        participants={session.participants}
        selfId={session.selfId}
        // Told from the viewer's own position: a watcher has no composer, so
        // "type an instruction to start" was an instruction they could not
        // follow.
        emptyHint={
          isDriver
            ? "Type an instruction below and the agent's work will stream here, step by step."
            : driver
              ? `${driver.displayName} is driving. Anything the agent does will appear here as it happens.`
              : "Nobody's driving yet. Take control below to send the first instruction."
        }
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
            onCancelRequest={session.cancelRequest}
            onHandOver={session.handOver}
            onRelease={session.releaseControl}
          />
          {isDriver && (
            <Composer
              onSend={(text) => session.instruct(text)}
              status={session.status}
              onStop={session.stop}
            />
          )}
        </>
      ) : (
        // The socket retries itself with backoff (useSession) and rejoins
        // on the same identity once it's back — this is honest status, not
        // a dead end. Replacing (not just supplementing) the control bar
        // here matters: driving or requesting control while the socket is
        // down would silently no-op, same as sending an instruction does.
        <div className="banner" role="status">
          <span className="banner-dot" aria-hidden />
          Connection lost — reconnecting. Your seat is held for 30 seconds.
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SessionStatus }) {
  // The dot carries the state as well as the word, so this stays readable
  // with any form of color blindness (PRODUCT.md: never color-alone).
  const modifier =
    status === "working"
      ? "status status--working"
      : status === "error"
        ? "status status--error"
        : "status";
  return (
    <span className={modifier}>
      <span className="status-dot" aria-hidden />
      {status}
    </span>
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
    <div className="join">
      {/* Someone lands here from a teammate's link — this was an unbranded
          box with a random id in it. The mark is the cheapest way to say
          what they've been invited into. */}
      <div className="join-mark">
        <span className="join-wordmark">relay</span>
        <span className="join-tag">live agent session</span>
      </div>

      <div className="join-panel">
        <h1 className="join-heading">Join session</h1>
        <p className="join-id">{sessionId}</p>

        <form onSubmit={handleSubmit} className="join-form">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your name"
            aria-label="your name"
            maxLength={32}
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

        {/* Says what actually happens next, without inventing presence data
            the client doesn't have until after it joins. */}
        <p className="join-note">
          Everyone with the link watches the same session, live. One person
          drives at a time — you can ask for the wheel once you&rsquo;re in.
        </p>

        {connection === "connecting" && (
          <p className="join-message">connecting…</p>
        )}
        {connection === "error" && (
          <p className="join-message join-message--error">
            could not reach the server
          </p>
        )}
        {lastError && (
          <p className="join-message join-message--error">{lastError}</p>
        )}
      </div>
    </div>
  );
}

function ReplayView({
  sessionId,
  replayed,
}: {
  sessionId: string;
  replayed: ReplayedSession;
}) {
  return (
    <div className="flex h-screen min-h-0 flex-col bg-[var(--bg)]">
      <header className="chrome-bar">
        <div className="chrome-mark">
          <span className="chrome-wordmark">relay</span>
          <span className="chrome-session-id">{sessionId}</span>
        </div>
        <div className="chrome-right">
          <span className="status">
            <span className="status-dot" aria-hidden />
            read-only replay
          </span>
        </div>
      </header>

      <StreamView
        events={replayed.events}
        participants={[]}
        selfId={null}
        emptyHint="This session ended without recording any actions."
      />

      <div className="banner banner--quiet" role="status">
        This session has ended — its transcript was recovered from the
        server.{" "}
        <Link
          href="/"
          className="text-[var(--text)] underline-offset-2 hover:underline"
        >
          Start a new one
        </Link>
      </div>
    </div>
  );
}
