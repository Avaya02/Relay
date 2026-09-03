"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { SessionStatus } from "@relay/shared";
import { useSession, type ReplayedSession } from "@/lib/useSession";
import { StreamView } from "@/components/StreamView";
import { Composer } from "@/components/Composer";
import { Presence } from "@/components/Presence";
import { ControlBar } from "@/components/ControlBar";
import { PlanStrip } from "@/components/PlanStrip";
import { WorkspaceRail } from "@/components/WorkspaceRail";
import { SessionsRail } from "@/components/SessionsRail";
import { AgentChip } from "@/components/AgentChip";
import { ShareControls } from "@/components/ShareControls";
import { SuggestBox, SuggestionQueue } from "@/components/Suggestions";
import { rememberSession } from "@/lib/recentSessions";
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

  const selfName =
    session.participants.find((p) => p.id === session.selfId)?.displayName ??
    null;
  const fileCount = session.changes?.files.length ?? 0;

  // Remember this session in the sidebar, but only once the server has
  // actually confirmed the join — a link to a session that rejected you is
  // not a session you were in. Runs above the early returns below because a
  // hook can't be called conditionally.
  useEffect(() => {
    if (session.selfId === null) return;
    rememberSession({
      id: sessionId,
      name: selfName ?? "",
      repo: session.repo,
      files: fileCount,
      runs: session.runCount,
      costUsd: session.totalCostUsd,
      status: session.status,
    });
  }, [
    sessionId,
    session.selfId,
    selfName,
    session.repo,
    fileCount,
    session.runCount,
    session.totalCostUsd,
    session.status,
  ]);

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
          {/* What the agent is editing. Watching code change without being
              told which codebase is a real orientation gap. */}
          {session.repo && (
            <span className="chrome-repo" title="Working on this repository">
              {session.repo}
            </span>
          )}
          <span className="chrome-session-id">{sessionId}</span>
        </div>
        <div className="chrome-right">
          <ShareControls sessionId={sessionId} />
          {/* What's running, on whose machine, and on whose credentials —
              including the case where nothing is attached at all. */}
          <AgentChip agent={session.agent} />
          <span className="chrome-divider" aria-hidden />
          {/* Per-run cost already rode on each agent_done; nothing summed
              them, so a six-turn session showed six prices and no total. */}
          {session.runCount > 0 && (
            <>
              <span
                className="chrome-cost"
                title={`${session.runCount} ${session.runCount === 1 ? "run" : "runs"} this session`}
              >
                ${session.totalCostUsd.toFixed(4)}
              </span>
              <span className="chrome-divider" aria-hidden />
            </>
          )}
          <StatusBadge status={session.status} />
          <span className="chrome-divider" aria-hidden />
          <Presence
            participants={session.participants}
            driverId={session.driverId}
            selfId={session.selfId}
          />
        </div>
      </header>

      {/* Two columns from here down: the stream and what it did to the repo.
          The rail gets its own full-height column rather than sitting under
          the ledger, so "what has it touched so far?" is answerable mid-run
          instead of only once a turn settles. */}
      <div className="session-body">
        <SessionsRail currentId={sessionId} />

        <div className="session-main">
          {session.plan && <PlanStrip plan={session.plan} />}

          <StreamView
            events={session.events}
            participants={session.participants}
            selfId={session.selfId}
            // Told from the viewer's own position: a watcher has no composer,
            // so "type an instruction to start" was an instruction they could
            // not follow.
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
              {/* Above the control bar, because it's about what runs next —
                  the same question the composer answers. */}
              <SuggestionQueue
                suggestions={session.suggestions}
                isDriver={isDriver}
                selfId={session.selfId}
                onPromote={session.promoteSuggestion}
                onDismiss={session.dismissSuggestion}
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
              {isDriver ? (
                <Composer
                  onSend={(text) => session.instruct(text)}
                  status={session.status}
                  onStop={session.stop}
                />
              ) : (
                // A watcher's version of the composer: same position, same
                // shape, but it proposes rather than commits.
                <SuggestBox onSuggest={session.suggest} disabled={false} />
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

        {/* Publishing is driver-only *and* needs a live socket — a publish
            sent while reconnecting would silently no-op, same as an
            instruction does. The file list itself stays readable either way. */}
        <WorkspaceRail
          events={session.events}
          changes={session.changes}
          isDriver={isDriver && session.connection === "open"}
          publishState={session.publishState}
          publishing={session.publishing}
          onPublish={session.publish}
        />
      </div>
    </div>
  );
}

// Four states, four badge variants. `working` is the only one that gets the
// accent, because it's the only one that means "right now" — done and error
// are outcomes, not liveness.
const STATUS_VARIANT: Record<SessionStatus, string> = {
  idle: "",
  working: "badge--live",
  done: "badge--ok",
  error: "badge--error",
};

function StatusBadge({ status }: { status: SessionStatus }) {
  // The dot carries the state as well as the word, so this stays readable
  // with any form of color blindness (PRODUCT.md: never color-alone).
  return (
    <span className={`badge ${STATUS_VARIANT[status]}`}>
      <span className="badge-dot status-dot" aria-hidden />
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
