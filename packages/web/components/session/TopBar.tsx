"use client";

import Link from "next/link";
import { Check, Copy, GitBranch } from "lucide-react";
import type { AgentInfo, Participant, SessionStatus } from "@relay/shared";
import { Presence } from "@/components/Presence";
import { StatusPill } from "./StatusPill";
import { SessionDetails } from "./SessionDetails";
import { SharePopover } from "./SharePopover";
import { useCopy } from "./useCopy";

/**
 * Three zones: what you're looking at, what state it's in, who's here.
 * Identity on the left, machine state in the middle, people and sharing on
 * the right — so the eye can find any of the three without reading the bar.
 */
export function TopBar({
  sessionId,
  repo,
  status,
  workingSince,
  agent,
  runCount,
  totalCostUsd,
  participants,
  driverId,
  selfId,
  pendingRequests,
  ended = false,
}: {
  sessionId: string;
  repo: string | null;
  status: SessionStatus;
  workingSince: string | null;
  agent: AgentInfo | null;
  runCount: number;
  totalCostUsd: number;
  participants: Participant[];
  driverId: string | null;
  selfId: string | null;
  pendingRequests: Participant[];
  ended?: boolean;
}) {
  const { copied, copy } = useCopy();

  return (
    <header className="topbar">
      <div className="topbar-zone topbar-identity">
        <Link href="/" className="topbar-wordmark" title="Relay home">
          relay
        </Link>
        {repo && (
          <>
            <span className="topbar-sep" aria-hidden>
              /
            </span>
            <span className="topbar-repo" title={`Working on ${repo}`}>
              <GitBranch size={13} />
              {repo}
            </span>
          </>
        )}
        <button
          type="button"
          className="topbar-id"
          onClick={() => copy(sessionId)}
          data-copied={copied || undefined}
          title={copied ? "Copied" : `Copy session id ${sessionId}`}
          aria-label={copied ? "Session id copied" : `Copy session id ${sessionId}`}
        >
          {sessionId.slice(0, 6)}
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </button>
      </div>

      <div className="topbar-zone topbar-state">
        {ended ? (
          <span className="pill" role="status">
            <span className="pill-dot" aria-hidden />
            Ended
          </span>
        ) : (
          <StatusPill status={status} workingSince={workingSince} />
        )}
        {!ended && (
          <SessionDetails
            agent={agent}
            status={status}
            runCount={runCount}
            totalCostUsd={totalCostUsd}
            sessionId={sessionId}
          />
        )}
      </div>

      <div className="topbar-zone topbar-people">
        {participants.length > 0 && (
          <Presence
            participants={participants}
            driverId={driverId}
            selfId={selfId}
            pendingRequests={pendingRequests}
          />
        )}
        <SharePopover sessionId={sessionId} />
      </div>
    </header>
  );
}
