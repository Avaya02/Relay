"use client";

import { Check, Copy } from "lucide-react";
import type { AgentInfo, SessionStatus } from "@relay/shared";
import { Popover } from "./Popover";
import { useCopy } from "./useCopy";
import { useShowSteps } from "@/lib/prefs";

/** `claude-sonnet-5` → `sonnet-5`. Only the vendor prefix, only when present. */
export function shortModel(model: string | null): string {
  if (!model) return "Live";
  return model.replace(/^claude-/, "");
}

export function agentLabel(agent: AgentInfo | null): string {
  if (!agent || !agent.runnerConnected) return "Offline";
  return agent.mode === "real" ? shortModel(agent.model) : "Demo";
}

export function RunnerCommand() {
  const { copied, copy } = useCopy();
  return (
    <div className="cmd">
      <code>npx relayrun</code>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        onClick={() => copy("npx relayrun")}
        data-copied={copied || undefined}
        aria-label={copied ? "Copied" : "Copy command"}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

/**
 * What's running, on whose machine, on whose money — and the room's own
 * numbers. Opens from the model + cost cluster in the top bar.
 */
export function SessionDetails({
  agent,
  status,
  runCount,
  totalCostUsd,
  sessionId,
}: {
  agent: AgentInfo | null;
  status: SessionStatus;
  runCount: number;
  totalCostUsd: number;
  sessionId: string;
}) {
  const [showSteps, setShowSteps] = useShowSteps();
  const offline = !agent || !agent.runnerConnected;
  const live = !offline && agent.mode === "real";

  return (
    <Popover
      label="Session details"
      width="21rem"
      trigger={(props) => (
        <button
          type="button"
          className={`topbar-agent${offline ? " topbar-agent--offline" : ""}`}
          title={
            offline
              ? "No agent is connected — nothing can run in this session"
              : live
                ? `${agent.model ?? "The Agent SDK"} on the host's machine`
                : "A scripted agent — no model, no cost"
          }
          {...props}
        >
          {agentLabel(agent)}
          {runCount > 0 && (
            <>
              <span className="topbar-agent-sep" aria-hidden>
                ·
              </span>
              <span className="topbar-cost">${totalCostUsd.toFixed(2)}</span>
            </>
          )}
        </button>
      )}
    >
      {offline ? (
        <>
          <p className="popover-title">No agent connected</p>
          <p className="popover-body">
            Relay runs the agent on someone&apos;s own machine, not on a server,
            so a session needs one attached before it can do anything. Whoever
            owns the repository starts it:
          </p>
          <RunnerCommand />
          <p className="popover-note">
            The transcript is still complete and control still works. Only new
            instructions need a runner.
          </p>
        </>
      ) : live ? (
        <>
          <p className="popover-title">
            {agent.model ? <code>{agent.model}</code> : "Real agent"}
          </p>
          <p className="popover-body">
            The Claude Agent SDK, on the machine of whoever started this
            session.{" "}
            {agent.keySource === "api-key" ? (
              <>
                Runs bill the key ending <code>··{agent.keyHint}</code>.
              </>
            ) : (
              <>Runs bill their own Claude Code login.</>
            )}
          </p>
          <p className="popover-note">
            No credential reaches this server or your browser. The repository
            stays on their machine — what travels is the transcript and the
            diff of every file it changed.
          </p>
        </>
      ) : (
        <>
          <p className="popover-title">Demo agent</p>
          <p className="popover-body">
            A scripted run — plan updates, a failing test, a fix, real file
            writes. Nothing is sent to a model and nothing is billed. The lock,
            the ordering and the diff are real.
          </p>
          <p className="popover-note">
            The host gets the real thing by dropping <code>--mock</code>.
          </p>
        </>
      )}

      <dl className="popover-facts">
        <dt>session</dt>
        <dd>
          <code>{sessionId}</code>
        </dd>
        <dt>status</dt>
        <dd>{status}</dd>
        <dt>runs</dt>
        <dd>{runCount}</dd>
        <dt>cost</dt>
        <dd>${totalCostUsd.toFixed(4)}</dd>
      </dl>

      <div className="popover-row">
        <span>
          Always show steps
          <br />
          <span className="popover-row-hint">Keep finished turns open</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={showSteps}
          className="toggle"
          onClick={() => setShowSteps(!showSteps)}
          aria-label="Always show steps"
        />
      </div>
    </Popover>
  );
}
