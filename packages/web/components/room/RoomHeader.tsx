"use client";

import Link from "next/link";
import { GitBranch, PanelLeft, PanelRight } from "lucide-react";
import type { AgentInfo, Participant, SessionStatus } from "@relay/shared";
import { Details } from "./Details";
import { Roster } from "./Roster";
import { Share } from "./Share";
import { StatusBadge } from "./StatusBadge";
import { Tip } from "./pop";

export function RoomHeader({
  sessionId,
  repo,
  title,
  status,
  workingSince,
  agent,
  runCount,
  totalCostUsd,
  participants,
  driverId,
  selfId,
  pendingRequests,
  onHandOver,
  ended = false,
  showRailToggle,
  onToggleRail,
  changesCount,
  changesOpen,
  onToggleChanges,
}: {
  sessionId: string;
  repo: string | null;
  title: string;
  status: SessionStatus;
  workingSince: string | null;
  agent: AgentInfo | null;
  runCount: number;
  totalCostUsd: number;
  participants: Participant[];
  driverId: string | null;
  selfId: string | null;
  pendingRequests: Participant[];
  onHandOver: (participantId: string) => void;
  ended?: boolean;
  showRailToggle: boolean;
  onToggleRail: () => void;
  changesCount: number;
  changesOpen: boolean;
  onToggleChanges: () => void;
}) {
  return (
    <header className="room-head">
      <div className="room-head-left">
        {showRailToggle && (
          <>
            <Tip label="Sessions">
              <button
                type="button"
                className="rbtn rbtn--icon"
                onClick={onToggleRail}
                aria-label="Show sessions"
              >
                <PanelLeft size={16} />
              </button>
            </Tip>
            <Link href="/" className="room-wordmark" aria-label="Relay home">
              relay
            </Link>
          </>
        )}
        {ended ? (
          <span className="room-crumb" data-static>
            <GitBranch size={14} aria-hidden />
            <span className="room-crumb-name">{repo ?? "Session"}</span>
          </span>
        ) : (
          <Details
            repo={repo}
            agent={agent}
            status={status}
            runCount={runCount}
            totalCostUsd={totalCostUsd}
            sessionId={sessionId}
          />
        )}
        {title && (
          <>
            <span className="room-head-sep" aria-hidden>
              /
            </span>
            <span className="room-title" title={title}>
              {title}
            </span>
          </>
        )}
        <StatusBadge
          status={status}
          workingSince={workingSince}
          offline={!ended && agent !== null && !agent.runnerConnected}
          ended={ended}
        />
      </div>

      <div className="room-head-right">
        {participants.length > 0 && (
          <Roster
            participants={participants}
            driverId={driverId}
            selfId={selfId}
            pendingRequests={pendingRequests}
            onHandOver={onHandOver}
          />
        )}
        <Share sessionId={sessionId} />
        <Tip label={changesOpen ? "Hide changes" : "Show changes"}>
          <button
            type="button"
            className="rbtn rbtn--icon room-panel-toggle"
            onClick={onToggleChanges}
            aria-pressed={changesOpen}
            aria-label={`Changes, ${changesCount} ${changesCount === 1 ? "file" : "files"}`}
          >
            <PanelRight size={16} />
            {changesCount > 0 && !changesOpen && <span className="count">{changesCount}</span>}
          </button>
        </Tip>
      </div>
    </header>
  );
}
