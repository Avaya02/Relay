"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession, type ReplayedSession } from "@/lib/useSession";
import { useDraft, useShowSteps } from "@/lib/prefs";
import { assignHues } from "@/lib/presence";
import { rememberSession } from "@/lib/recentSessions";
import { StreamView } from "@/components/stream/StreamView";
import {
  firstInstruction,
  groupTurns,
  lastInstructionBy,
  queuedCount,
  workingSince,
} from "@/components/stream/rows";
import { JoinGate } from "@/components/session/JoinGate";
import { ChangesRail } from "@/components/changes/ChangesRail";
import { DiffDrawer } from "@/components/changes/DiffDrawer";
import { changedFiles } from "@/components/changes/derive";
import { RoomHeader } from "@/components/room/RoomHeader";
import { Dock } from "@/components/room/Dock";
import { Intro } from "@/components/room/Intro";
import { PlanStrip } from "@/components/room/PlanStrip";
import { SessionsRail } from "@/components/room/SessionsRail";
import { usePanels } from "@/components/room/usePanels";
import { RoomFrame } from "@/components/room/RoomFrame";
import type { ComposerBlock } from "@/components/room/Composer";

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params);
  const session = useSession(sessionId);
  const [attemptedJoin, setAttemptedJoin] = useState(false);
  const [draft, setDraft] = useDraft(sessionId);
  const [showSteps] = useShowSteps();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const panels = usePanels();

  const turns = useMemo(() => groupTurns(session.events), [session.events]);
  const files = useMemo(
    () => changedFiles(session.events, session.changes),
    [session.events, session.changes],
  );
  const title = useMemo(() => firstInstruction(session.events), [session.events]);
  const hues = useMemo(() => assignHues(session.participants), [session.participants]);

  const selfName =
    session.participants.find((p) => p.id === session.selfId)?.displayName ?? null;
  const fileCount = files.length;

  // Only after the server confirms the join; a rejected link isn't a session you were in.
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
        panels={panels}
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

  // Suggestions need no runner, so only the driver is blocked by a missing one.
  const block: ComposerBlock = !online
    ? { kind: "reconnecting" }
    : isDriver && session.agent && !runnerConnected
      ? { kind: "offline" }
      : null;

  return (
    <RoomFrame
      hues={hues}
      driverHue={driver ? hues.get(driver.id) : undefined}
      panels={panels}
      rail={<SessionsRail currentId={sessionId} onClose={panels.toggleSessions} />}
      header={
        <RoomHeader
          sessionId={sessionId}
          repo={session.repo}
          title={title}
          status={session.status}
          workingSince={workingSince(turns)}
          agent={session.agent}
          runCount={session.runCount}
          totalCostUsd={session.totalCostUsd}
          participants={session.participants}
          driverId={session.driverId}
          selfId={session.selfId}
          pendingRequests={session.pendingRequests}
          onHandOver={session.handOver}
          showRailToggle={!panels.sessionsOpen}
          onToggleRail={panels.toggleSessions}
          changesCount={fileCount}
          changesOpen={panels.changesOpen}
          onToggleChanges={panels.toggleChanges}
        />
      }
      changes={
        <ChangesRail
          files={files}
          measured={session.changes?.files.length ?? 0}
          insertions={session.changes?.insertions ?? 0}
          deletions={session.changes?.deletions ?? 0}
          selectedPath={openPath}
          onSelect={setOpenPath}
          // Nothing to publish until a diff has been measured.
          canPublish={isDriver && online && (session.changes?.files.length ?? 0) > 0}
          publishState={session.publishState}
          publishing={session.publishing}
          onPublish={session.publish}
          onClose={panels.toggleChanges}
        />
      }
    >
      {session.plan && <PlanStrip plan={session.plan} />}

      <StreamView
        storeKey={sessionId}
        events={session.events}
        participants={session.participants}
        selfId={session.selfId}
        status={session.status}
        runnerConnected={runnerConnected}
        showSteps={showSteps}
        demo={session.agent?.mode === "mock"}
        empty={
          <Intro
            repo={session.repo}
            agent={session.agent}
            participants={session.participants}
            driverId={session.driverId}
            selfId={session.selfId}
            onExample={setDraft}
            suggestionsPending={session.suggestions.length > 0}
          />
        }
      />

      <Dock
        online={online}
        participants={session.participants}
        driverId={session.driverId}
        selfId={session.selfId}
        pendingRequests={session.pendingRequests}
        suggestions={session.suggestions}
        onRequestControl={session.requestControl}
        onCancelRequest={session.cancelRequest}
        onHandOver={session.handOver}
        onRelease={session.releaseControl}
        onPromote={session.promoteSuggestion}
        onDismiss={session.dismissSuggestion}
        composer={{
          mode: isDriver ? "send" : "suggest",
          value: draft,
          onChange: setDraft,
          onSend: isDriver ? session.instruct : session.suggest,
          onStop: session.stop,
          status: session.status,
          queued: queuedCount(turns),
          block,
          repo: session.repo,
          agent: session.agent,
          driverName: driver && !isDriver ? driver.displayName : null,
          recall: lastInstructionBy(session.events, session.selfId),
        }}
      />

      {openFile && <DiffDrawer file={openFile} onClose={closeDrawer} />}
    </RoomFrame>
  );
}

const NO_HUES = new Map<string, string>();

function ReplayView({
  sessionId,
  replayed,
  showSteps,
  openPath,
  onSelectPath,
  panels,
}: {
  sessionId: string;
  replayed: ReplayedSession;
  showSteps: boolean;
  openPath: string | null;
  onSelectPath: (path: string | null) => void;
  panels: ReturnType<typeof usePanels>;
}) {
  const files = useMemo(() => changedFiles(replayed.events, null), [replayed.events]);
  const title = useMemo(() => firstInstruction(replayed.events), [replayed.events]);
  const openFile = openPath ? (files.find((f) => f.path === openPath) ?? null) : null;

  return (
    <RoomFrame
      hues={NO_HUES}
      driverHue={undefined}
      panels={panels}
      rail={<SessionsRail currentId={sessionId} onClose={panels.toggleSessions} />}
      header={
        <RoomHeader
          sessionId={sessionId}
          repo={null}
          title={title}
          status={replayed.status}
          workingSince={null}
          agent={null}
          runCount={0}
          totalCostUsd={0}
          participants={[]}
          driverId={null}
          selfId={null}
          pendingRequests={[]}
          onHandOver={() => {}}
          ended
          showRailToggle={!panels.sessionsOpen}
          onToggleRail={panels.toggleSessions}
          changesCount={files.length}
          changesOpen={panels.changesOpen}
          onToggleChanges={panels.toggleChanges}
        />
      }
      changes={
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
          onClose={panels.toggleChanges}
        />
      }
    >
      <StreamView
        storeKey={`${sessionId}:replay`}
        events={replayed.events}
        participants={[]}
        selfId={null}
        status={replayed.status === "working" ? "done" : replayed.status}
        runnerConnected={false}
        showSteps={showSteps}
        empty={
          <div className="intro">
            <h2 className="intro-title">Nothing was recorded</h2>
            <p className="intro-lede">This session ended without any actions.</p>
          </div>
        }
      />
      <div className="dock">
        <div className="dock-card">
          <div className="dock-ended" role="status">
            <span>This session has ended. Its transcript was recovered from the server.</span>
            <Link href="/" className="rbtn rbtn--secondary rbtn--sm">
              Start a new one
            </Link>
          </div>
        </div>
      </div>
      {openFile && <DiffDrawer file={openFile} onClose={() => onSelectPath(null)} />}
    </RoomFrame>
  );
}
