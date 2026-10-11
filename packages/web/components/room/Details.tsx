"use client";

import { ChevronDown, GitBranch } from "lucide-react";
import type { AgentInfo, SessionStatus } from "@relay/shared";
import { useShowSteps } from "@/lib/prefs";
import { RoomPopover } from "./pop";
import { RunnerCommand, agentLabel, agentState } from "./agent";

/**
 * The repository is the session's name, so it is also the door to what's
 * running it: which agent, on whose machine, on whose money.
 */
export function Details({
  repo,
  agent,
  status,
  runCount,
  totalCostUsd,
  sessionId,
}: {
  repo: string | null;
  agent: AgentInfo | null;
  status: SessionStatus;
  runCount: number;
  totalCostUsd: number;
  sessionId: string;
}) {
  const [showSteps, setShowSteps] = useShowSteps();
  const state = agentState(agent);

  return (
    <RoomPopover
      label="Session details"
      align="start"
      width="22rem"
      trigger={
        <button type="button" className="room-crumb">
          <GitBranch size={14} aria-hidden />
          <span className="room-crumb-name">{repo ?? "Session"}</span>
          <ChevronDown size={13} aria-hidden />
        </button>
      }
    >
      <div className="rpop-section">
        {state === "offline" ? (
          <>
            <p className="rpop-title">No agent connected</p>
            <p className="rpop-body">
              Relay runs the agent on the host&apos;s own machine, so a session needs one
              attached before it can do anything. Whoever owns the repository starts it:
            </p>
            <p className="rpop-note">
              <RunnerCommand />
            </p>
            <p className="rpop-note">
              The transcript and the wheel still work. Only new instructions need a runner.
            </p>
          </>
        ) : state === "live" && agent ? (
          <>
            <p className="rpop-title">
              {agent.model ? <code>{agent.model}</code> : "Live agent"}
            </p>
            <p className="rpop-body">
              The Claude Agent SDK, on the machine of whoever started this session.{" "}
              {agent.keySource === "api-key" ? (
                <>
                  Runs bill the key ending <code>··{agent.keyHint}</code>.
                </>
              ) : (
                <>Runs bill their own Claude Code login.</>
              )}
            </p>
            <p className="rpop-note">
              No credential reaches this server or your browser. The repository stays on
              their machine; what travels is the transcript and the diff of every file it
              changed.
            </p>
          </>
        ) : (
          <>
            <p className="rpop-title">Demo agent</p>
            <p className="rpop-body">
              A scripted run: plan updates, a failing test, a fix, real file writes. Nothing
              is sent to a model and nothing is billed. The wheel, the ordering and the diff
              are real.
            </p>
            <p className="rpop-note">
              The host gets the real agent by dropping <code>--mock</code>.
            </p>
          </>
        )}
      </div>

      <div className="rpop-section">
        <dl className="facts">
          <dt>Agent</dt>
          <dd>{agentLabel(agent)}</dd>
          <dt>Session</dt>
          <dd>{sessionId}</dd>
          <dt>Status</dt>
          <dd>{status}</dd>
          <dt>Runs</dt>
          <dd>{runCount}</dd>
          <dt>Spent</dt>
          <dd>{state === "demo" ? "nothing, demo" : `$${totalCostUsd.toFixed(4)}`}</dd>
        </dl>
      </div>

      <div className="rpop-section">
        <div className="row-toggle">
          <span>
            Always show steps
            <small>Keep finished turns open</small>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={showSteps}
            className="rswitch"
            onClick={() => setShowSteps(!showSteps)}
            aria-label="Always show steps"
          />
        </div>
      </div>
    </RoomPopover>
  );
}
