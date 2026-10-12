"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Check, CornerDownLeft, GitBranch, LoaderCircle, Square, Unplug } from "lucide-react";
import type { AgentInfo, SessionStatus } from "@relay/shared";
import { RunnerCommand, agentLabel, agentState } from "./agent";
import { Tip } from "./pop";

// Tall enough for a pasted stack trace, short enough not to squeeze the stream.
const MAX_ROWS = 10;

export type ComposerBlock = { kind: "offline" } | { kind: "reconnecting" } | null;

// One component for both roles so nothing jumps when the wheel moves.
export function Composer({
  mode,
  value,
  onChange,
  onSend,
  onStop,
  status,
  queued,
  block,
  repo,
  agent,
  driverName,
  recall,
}: {
  mode: "send" | "suggest";
  value: string;
  onChange: (next: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  status: SessionStatus;
  queued: number;
  block: ComposerBlock;
  repo: string | null;
  agent: AgentInfo | null;
  driverName: string | null;
  recall: string | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [sent, setSent] = useState(false);
  const working = status === "working";
  const disabled = block !== null;

  // scrollHeight, not "\n" count: one logical line wraps into several in a narrow column.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const cs = getComputedStyle(el);
    const chrome = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const line = parseFloat(cs.lineHeight) || 23;
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_ROWS + chrome)}px`;
  }, [value]);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(false), 2400);
    return () => clearTimeout(t);
  }, [sent]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    onChange("");
    if (mode === "suggest") setSent(true);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
      return;
    }
    if (e.key === "ArrowUp" && !value && recall) {
      e.preventDefault();
      onChange(recall);
      return;
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    // An IME uses Enter to commit a character; sending would truncate the word.
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  }

  const placeholder =
    block?.kind === "offline"
      ? "Start the agent to send instructions"
      : block?.kind === "reconnecting"
        ? "Reconnecting…"
        : mode === "suggest"
          ? driverName
            ? `Suggest something to ${driverName}…`
            : "Suggest an instruction for whoever takes the wheel…"
          : working
            ? "Queue the next instruction…"
            : repo
              ? `Ask the agent to do something in ${repo}…`
              : "Ask the agent to do something…";

  const canSubmit = !disabled && value.trim().length > 0;
  const state = agentState(agent);

  return (
    <form
      onSubmit={handleSubmit}
      className="composer"
      data-disabled={disabled || undefined}
      aria-label={mode === "suggest" ? "Suggest an instruction" : "Instruction for the agent"}
    >
      {block?.kind === "offline" && (
        <div className="composer-notice" role="status">
          <Unplug size={14} aria-hidden />
          <span>No agent is connected. Whoever owns the repository starts it with</span>
          <RunnerCommand />
        </div>
      )}
      {block?.kind === "reconnecting" && (
        <div className="composer-notice" role="status">
          <LoaderCircle size={14} className="composer-spin" aria-hidden />
          <span>Reconnecting. Your seat is held for 30 seconds.</span>
        </div>
      )}

      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={mode === "suggest" ? "Suggestion for the driver" : "Instruction for the agent"}
        className="composer-input"
        disabled={disabled}
        spellCheck={false}
      />

      <div className="composer-bar">
        <div className="composer-context">
          {repo && (
            <span className="composer-chip" title={`Working in ${repo}`}>
              <GitBranch size={13} aria-hidden />
              <span className="composer-chip-text">{repo}</span>
            </span>
          )}
          <span
            className="composer-chip"
            data-agent={state}
            title={state === "offline" ? "No agent connected" : "The agent that will run this"}
          >
            <span className="agent-dot" aria-hidden />
            {agentLabel(agent)}
          </span>
        </div>

        <div className="composer-actions">
          {sent ? (
            <span className="composer-sent" role="status">
              <Check size={13} aria-hidden />
              Sent{driverName ? ` to ${driverName}` : ""}
            </span>
          ) : (
            !disabled && (
              <span className="composer-hint" aria-hidden>
                <kbd>
                  <CornerDownLeft size={11} />
                </kbd>
                {mode === "suggest" ? "to suggest" : working ? "to queue" : "to send"}
              </span>
            )
          )}
          {mode === "send" && working && !disabled && (
            <>
              {queued > 0 && (
                <span className="composer-queued" title="Waiting behind the current run">
                  {queued} queued
                </span>
              )}
              <button type="button" className="rbtn rbtn--ghost rbtn--sm composer-stop" onClick={onStop}>
                <Square size={9} fill="currentColor" aria-hidden />
                Stop
              </button>
            </>
          )}
          {mode === "suggest" ? (
            <button
              type="submit"
              className="rbtn rbtn--primary rbtn--sm composer-suggest"
              disabled={!canSubmit}
            >
              Suggest
              <ArrowUp size={14} aria-hidden />
            </button>
          ) : (
            <Tip label={working ? "Queue" : "Send"}>
              <button
                type="submit"
                className="composer-send"
                disabled={!canSubmit}
                aria-label={working ? "Queue" : "Send"}
              >
                <ArrowUp size={17} strokeWidth={2.25} />
              </button>
            </Tip>
          )}
        </div>
      </div>
    </form>
  );
}
