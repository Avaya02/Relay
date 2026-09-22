"use client";

import Link from "next/link";
import { Check, Copy } from "lucide-react";
import type { AgentInfo, Participant, SessionStatus } from "@relay/shared";
import { Presence } from "@/components/Presence";
import { StatusPill } from "./StatusPill";
import { SessionDetails } from "./SessionDetails";
import { SharePopover } from "./SharePopover";
import { useCopy } from "./useCopy";

/**
 * Three zones: the product on the left, the session in the middle, the people
 * on the right. The repository is the session's name and sits centre stage;
 * it also opens the details (agent, cost, runs) that used to crowd the bar —
 * the composer already says which model will run, so the bar doesn't repeat it.
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
        <span className="topbar-sep" aria-hidden>
          /
        </span>
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
          <>
            {repo && (
              <span className="topbar-repo" style={{ cursor: "default" }}>
                {repo}
              </span>
            )}
            <span className="pill" role="status">
              <span className="pill-dot" aria-hidden />
              Ended
            </span>
          </>
        ) : (
          <>
            <SessionDetails
              agent={agent}
              status={status}
              runCount={runCount}
              totalCostUsd={totalCostUsd}
              sessionId={sessionId}
              repo={repo}
            />
            <StatusPill status={status} workingSince={workingSince} />
          </>
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
