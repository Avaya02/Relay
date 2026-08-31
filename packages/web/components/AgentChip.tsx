"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentInfo } from "@relay/shared";

// WHAT'S ACTUALLY RUNNING, on whose machine, and on whose money.
//
// Relay defaults to a scripted mock agent so the whole product can be used
// with no API key and no cost. That's the right default, but it was also
// invisible: a visitor watched a convincing run with no way to know it wasn't
// a model.
//
// Since the agent moved onto the driver's own machine there's a second
// question, and it's the more urgent one: is anything attached at all? A room
// with no runner looks identical to a room with an idle one, right up until
// someone types an instruction and it's refused.
//
//   Offline      — no relay-agent is connected. Nothing can run.
//   Demo         — the scripted agent. Costs nothing, decides nothing.
//   Live         — the real Agent SDK on the host's own Claude Code login.
//   Live ··wxyz  — the real Agent SDK on a key the host passed to the CLI.

export function AgentChip({ agent }: { agent: AgentInfo | null }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape. Both, not either: a popover that
  // only closes one way is the kind of thing that feels broken without anyone
  // being able to say why.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!agent) return null;

  const offline = !agent.runnerConnected;
  const live = !offline && agent.mode === "real";
  const label = offline ? "Offline" : live ? "Live" : "Demo";

  const title = offline
    ? "No agent is connected — nothing can run in this session"
    : live
      ? agent.keySource === "api-key"
        ? "Running on the host's machine, billed to the key they supplied"
        : "Running on the host's machine, billed to their Claude Code login"
      : "Running a scripted agent on the host's machine — no model, no cost";

  return (
    <div className="agent" ref={wrapRef}>
      <button
        type="button"
        className={`agent-chip ${live ? "agent-chip--live" : ""} ${
          offline ? "agent-chip--offline" : ""
        }`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={title}
      >
        <span className="agent-dot" aria-hidden />
        {label}
        {!offline && agent.keyHint && (
          <span className="agent-hint">··{agent.keyHint}</span>
        )}
      </button>

      {open && (
        <div className="agent-panel" role="dialog" aria-label="Agent details">
          <AgentPanel agent={agent} />
        </div>
      )}
    </div>
  );
}

function AgentPanel({ agent }: { agent: AgentInfo }) {
  if (!agent.runnerConnected) {
    return (
      <>
        <p className="agent-title">No agent connected</p>
        <p className="agent-body">
          Relay runs the agent on someone&apos;s own machine, not on a server —
          so a session needs one attached before it can do anything. Whoever
          owns the repository starts it:
        </p>
        <pre className="agent-cmd">relay-agent</pre>
        <p className="agent-note">
          The transcript above is still complete, and control still works. Only
          new instructions need a runner.
        </p>
      </>
    );
  }

  if (agent.mode === "real") {
    return (
      <>
        <p className="agent-title">
          {agent.keySource === "api-key"
            ? "Running on a supplied key"
            : "Running on the host's login"}
        </p>
        <p className="agent-body">
          The real Claude Agent SDK, on the machine of whoever started this
          session.{" "}
          {agent.keySource === "api-key" ? (
            <>
              Runs bill the key ending <code>··{agent.keyHint}</code>, which they
              passed to the CLI.
            </>
          ) : (
            <>Runs bill their own Claude Code login.</>
          )}
        </p>
        <p className="agent-note">
          No credential reaches this server or your browser. The repository
          never leaves their machine either — everything here is a description
          of what happened to it.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="agent-title">Demo mode</p>
      <p className="agent-body">
        A scripted agent is streaming a realistic run — plan updates, a failing
        test, a fix, real file writes. Nothing is sent to a model and nothing is
        billed. Everything else you see is real: the lock, the ordering, the
        diff.
      </p>
      <p className="agent-note">
        The host can run the real thing with <code>relay-agent --real</code>,
        against their own repository and their own credentials.
      </p>
    </>
  );
}
