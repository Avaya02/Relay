"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentInfo } from "@relay/shared";
import { Button } from "@/components/ui/button";

// WHAT'S ACTUALLY RUNNING, and on whose money.
//
// Relay defaults to a scripted mock agent so the whole product can be used
// with no API key and no cost. That's the right default, but it was also
// invisible: a visitor watched a convincing run and had no way to know it
// wasn't a model. And on a shared instance the opposite question matters more
// — if this *is* a real run, someone is being billed for it, and the room
// should be able to see who.
//
// So the chip is always present and always says one of three things:
//   Demo         — the scripted agent. Costs nothing, decides nothing.
//   Live         — the real Agent SDK on the host's own credentials.
//   Live ··wxyz  — the real Agent SDK on a key someone here supplied.
//
// The key itself never reaches this component. The server sends four
// characters and a name; that is the entire client-side surface area.

export function AgentChip({
  agent,
  isDriver,
  selfName,
  onSetKey,
  onClearKey,
}: {
  agent: AgentInfo | null;
  isDriver: boolean;
  selfName: string | null;
  onSetKey: (key: string) => void;
  onClearKey: () => void;
}) {
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

  const live = agent.mode === "real";
  const label = live ? "Live" : "Demo";

  return (
    <div className="agent" ref={wrapRef}>
      <button
        type="button"
        className={`agent-chip ${live ? "agent-chip--live" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={
          live
            ? agent.source === "session"
              ? `Running on ${agent.keyOwner ?? "a participant"}'s API key`
              : "Running on this server's own API key"
            : "Running a scripted agent — no model, no cost"
        }
      >
        <span className="agent-dot" aria-hidden />
        {label}
        {agent.keyHint && (
          <span className="agent-hint">··{agent.keyHint}</span>
        )}
      </button>

      {open && (
        <div className="agent-panel" role="dialog" aria-label="Agent settings">
          <AgentPanel
            agent={agent}
            isDriver={isDriver}
            selfName={selfName}
            onSetKey={(k) => {
              onSetKey(k);
              setOpen(false);
            }}
            onClearKey={() => {
              onClearKey();
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function AgentPanel({
  agent,
  isDriver,
  selfName,
  onSetKey,
  onClearKey,
}: {
  agent: AgentInfo;
  isDriver: boolean;
  selfName: string | null;
  onSetKey: (key: string) => void;
  onClearKey: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const key = value.trim();
    // Mirrors the server's rule so the common typo gets an answer instantly
    // instead of a round trip. The server still checks — this is a
    // convenience, never the enforcement.
    if (!key.startsWith("sk-ant-")) {
      setError("Anthropic keys start with sk-ant-");
      return;
    }
    setError(null);
    setValue("");
    onSetKey(key);
  }

  // --- a key is in play ---------------------------------------------------
  if (agent.source === "session") {
    const mine = agent.keyOwner !== null && agent.keyOwner === selfName;
    return (
      <>
        <p className="agent-title">Running on a supplied key</p>
        <p className="agent-body">
          Ending <code>··{agent.keyHint}</code>, from{" "}
          <strong>{mine ? "you" : (agent.keyOwner ?? "a participant")}</strong>.
          Every run in this session bills that account. The key is held in
          memory for this session only — never written to disk, and it leaves
          when its owner does.
        </p>
        {isDriver || mine ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full text-xs"
            onClick={onClearKey}
          >
            Remove the key
          </Button>
        ) : (
          <p className="agent-note">
            The driver or {agent.keyOwner ?? "its owner"} can remove it.
          </p>
        )}
      </>
    );
  }

  // --- the host's own credentials -----------------------------------------
  if (agent.source === "server") {
    return (
      <>
        <p className="agent-title">Running on this server&apos;s key</p>
        <p className="agent-body">
          The real Claude Agent SDK, billed to whoever runs this instance.
        </p>
      </>
    );
  }

  // --- the mock -----------------------------------------------------------
  return (
    <>
      <p className="agent-title">Demo mode</p>
      <p className="agent-body">
        A scripted agent is streaming a realistic run — plan updates, a failing
        test, a fix, real file writes. Nothing is sent to a model and nothing
        is billed. Everything else you see is real: the lock, the ordering, the
        diff.
      </p>

      {!agent.byoAllowed ? (
        // Said plainly rather than hidden. The reason this is off is a good
        // one and it's more interesting than the feature would have been.
        <p className="agent-note">
          This instance doesn&apos;t accept API keys. The agent runs with shell
          access inside its clone, so letting strangers drive a real one is a
          sandboxing problem rather than a billing one — run Relay yourself to
          use your own key.
        </p>
      ) : !isDriver ? (
        <p className="agent-note">Only the driver can supply a key.</p>
      ) : (
        <form className="agent-form" onSubmit={submit}>
          <label className="agent-label" htmlFor="agent-key">
            Use your own Anthropic key
          </label>
          <input
            id="agent-key"
            className="agent-input"
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="sk-ant-..."
            autoComplete="off"
            spellCheck={false}
            // Keeps the value out of password managers and autofill history:
            // this is a bearer credential being pasted, not an account login.
            data-1p-ignore
          />
          {error && <p className="agent-error">{error}</p>}
          <Button size="sm" type="submit" className="h-7 w-full text-xs">
            Use this key
          </Button>
          <p className="agent-note">
            Held in memory for this session only. Never stored, never logged,
            and never sent back to any browser — the room sees the last four
            characters and nothing else.
          </p>
        </form>
      )}
    </>
  );
}
