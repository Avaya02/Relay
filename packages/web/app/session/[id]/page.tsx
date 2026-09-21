"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession, type ReplayedSession } from "@/lib/useSession";
import { useDraft, useShowSteps } from "@/lib/prefs";
import { rememberSession } from "@/lib/recentSessions";
import { StreamView } from "@/components/stream/StreamView";
import {
  firstInstruction,
  groupTurns,
  lastInstructionBy,
  queuedCount,
  workingSince,
} from "@/components/stream/rows";
import { Composer, type ComposerBlock } from "@/components/Composer";
import { ControlBar } from "@/components/ControlBar";
import { PlanStrip } from "@/components/PlanStrip";
import { SessionsRail } from "@/components/SessionsRail";
import { SuggestionQueue } from "@/components/Suggestions";
import { TopBar } from "@/components/session/TopBar";
import { EmptyCanvas } from "@/components/session/EmptyCanvas";
import { JoinGate } from "@/components/session/JoinGate";
import { ChangesRail } from "@/components/changes/ChangesRail";
import { DiffDrawer } from "@/components/changes/DiffDrawer";
import { changedFiles } from "@/components/changes/derive";

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params);
  const session = useSession(sessionId);
  const [attemptedJoin, setAttemptedJoin] = useState(false);
  const [draft, setDraft] = useDraft(sessionId);
  const [showSteps] = useShowSteps();
  const [openPath, setOpenPath] = useState<string | null>(null);

  const turns = useMemo(() => groupTurns(session.events), [session.events]);
  const files = useMemo(
    () => changedFiles(session.events, session.changes),
    [session.events, session.changes],
  );
  const title = useMemo(() => firstInstruction(session.events), [session.events]);

  const selfName =
    session.participants.find((p) => p.id === session.selfId)?.displayName ?? null;
  const fileCount = files.length;

  // Remembered only once the server has confirmed the join — a link to a
  // session that rejected you is not a session you were in.
  useEffect(() => {
    if (session.selfId === null) return;
    rememberSession({
      id: sessionId,
      name: selfName ?? "",
      repo: session.repo,
      title,
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
    title,
    fileCount,
    session.runCount,
    session.totalCostUsd,
    session.status,
  ]);

  const closeDrawer = useCallback(() => setOpenPath(null), []);

  if (session.replayed) {
    return (
      <ReplayView
        sessionId={sessionId}
        replayed={session.replayed}
        showSteps={showSteps}
        openPath={openPath}
        onSelectPath={setOpenPath}
      />
    );
  }

  if (session.selfId === null) {
    return (
      <JoinGate
        sessionId={sessionId}
        connection={session.connection}
        lastError={session.lastError}
        joining={attemptedJoin || session.resuming}
        resuming={session.resuming}
        onJoin={(name) => {
          session.join(name);
          setAttemptedJoin(true);
        }}
      />
    );
  }

  const isDriver = session.selfId === session.driverId;
  const driver = session.participants.find((p) => p.id === session.driverId) ?? null;
  const online = session.connection === "open";
  const runnerConnected = session.agent?.runnerConnected ?? false;
  const openFile = openPath ? (files.find((f) => f.path === openPath) ?? null) : null;

  // The composer's blocked states, most-blocking first. A watcher's
  // suggestion needs no runner, so only the driver is held back by one.
  const block: ComposerBlock = !online
    ? { kind: "reconnecting" }
    : isDriver && session.agent && !runnerConnected
      ? { kind: "offline" }
      : null;

  return (
    <div className="shell">
      <TopBar
        sessionId={sessionId}
        repo={session.repo}
        status={session.status}
        workingSince={workingSince(turns)}
        agent={session.agent}
        runCount={session.runCount}
        totalCostUsd={session.totalCostUsd}
        participants={session.participants}
        driverId={session.driverId}
        selfId={session.selfId}
        pendingRequests={session.pendingRequests}
      />

      <div className="shell-body">
        <SessionsRail currentId={sessionId} />

        <div className="shell-main">
          {session.plan && <PlanStrip plan={session.plan} />}

          <StreamView
            storeKey={sessionId}
            events={session.events}
            participants={session.participants}
            selfId={session.selfId}
            status={session.status}
            runnerConnected={runnerConnected}
            showSteps={showSteps}
            empty={
              <EmptyCanvas
                repo={session.repo}
                agent={session.agent}
                participants={session.participants}
                driverId={session.driverId}
                selfId={session.selfId}
                isDriver={isDriver}
                onExample={setDraft}
              />
            }
          />

          <div className="dock">
            {online && (
              <>
                <SuggestionQueue
                  suggestions={session.suggestions}
                  isDriver={isDriver}
                  selfId={session.selfId}
                  onPromote={session.promoteSuggestion}
                  onDismiss={session.dismissSuggestion}
                />
                {/* Driving or requesting control while the socket is down
                    would silently no-op, so the strip goes with it. */}
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
              </>
            )}
            <Composer
              mode={isDriver ? "send" : "suggest"}
              value={draft}
              onChange={setDraft}
              onSend={isDriver ? session.instruct : session.suggest}
              onStop={session.stop}
              status={session.status}
              queued={queuedCount(turns)}
              block={block}
              repo={session.repo}
              agent={session.agent}
              driverName={driver && !isDriver ? driver.displayName : null}
              recall={lastInstructionBy(session.events, session.selfId)}
            />
          </div>

          {openFile && <DiffDrawer file={openFile} onClose={closeDrawer} />}
        </div>

        <ChangesRail
          files={files}
          measured={session.changes?.files.length ?? 0}
          insertions={session.changes?.insertions ?? 0}
          deletions={session.changes?.deletions ?? 0}
          selectedPath={openPath}
          onSelect={setOpenPath}
          // Publishing is driver-only *and* needs a live socket and something
          // measured: nothing to publish until a diff exists.
          canPublish={isDriver && online && (session.changes?.files.length ?? 0) > 0}
          publishState={session.publishState}
          publishing={session.publishing}
          onPublish={session.publish}
        />
      </div>
    </div>
  );
}

// A session that isn't live but whose transcript survived a restart. Same
// shell as a live one — the rails, the stream, the changes — so ending a
// session doesn't turn it into a different app.
function ReplayView({
  sessionId,
  replayed,
  showSteps,
  openPath,
  onSelectPath,
}: {
  sessionId: string;
  replayed: ReplayedSession;
  showSteps: boolean;
  openPath: string | null;
  onSelectPath: (path: string | null) => void;
}) {
  const files = useMemo(() => changedFiles(replayed.events, null), [replayed.events]);
  const openFile = openPath ? (files.find((f) => f.path === openPath) ?? null) : null;

  return (
    <div className="shell">
      <TopBar
        sessionId={sessionId}
        repo={null}
        status={replayed.status}
        workingSince={null}
        agent={null}
        runCount={0}
        totalCostUsd={0}
        participants={[]}
        driverId={null}
        selfId={null}
        pendingRequests={[]}
        ended
      />
      <div className="shell-body">
        <SessionsRail currentId={sessionId} />
        <div className="shell-main">
          <StreamView
            storeKey={`${sessionId}:replay`}
            events={replayed.events}
            participants={[]}
            selfId={null}
            status={replayed.status === "working" ? "done" : replayed.status}
            runnerConnected={false}
            showSteps={showSteps}
            empty={
              <div className="empty">
                <h2 className="empty-title">Nothing was recorded</h2>
                <p className="empty-lede">This session ended without any actions.</p>
              </div>
            }
          />
          <div className="dock">
            <div className="ended" role="status">
              <span>This session has ended — its transcript was recovered from the server.</span>
              <Link href="/">Start a new one</Link>
            </div>
          </div>
          {openFile && <DiffDrawer file={openFile} onClose={() => onSelectPath(null)} />}
        </div>
        <ChangesRail
          files={files}
          measured={0}
          insertions={0}
          deletions={0}
          selectedPath={openPath}
          onSelect={onSelectPath}
          canPublish={false}
          publishState={null}
          publishing={false}
          onPublish={() => {}}
        />
      </div>
    </div>
  );
}
