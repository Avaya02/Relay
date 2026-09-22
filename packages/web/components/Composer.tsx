"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, CircleAlert, GitBranch, Square } from "lucide-react";
import type { AgentInfo, SessionStatus } from "@relay/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RunnerCommand, agentLabel } from "@/components/session/SessionDetails";

// Grows to this many rows, then scrolls: tall enough for a pasted stack trace
// to be readable while writing, short enough that the stream above it isn't
// squeezed out of the viewport.
const MAX_ROWS = 10;

export type ComposerMode = "send" | "suggest";

export type ComposerBlock =
  | { kind: "offline" }
  | { kind: "reconnecting" }
  | { kind: "ended" }
  | null;

/**
 * One card for every role. The driver sends; a watcher suggests; the
 * difference is the placeholder and the primary control, not a second
 * component with its own tokens — so nothing jumps when the wheel moves.
 */
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
  mode: ComposerMode;
  value: string;
  onChange: (next: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  status: SessionStatus;
  /** Instructions accepted by the server but waiting behind the current run. */
  queued: number;
  block: ComposerBlock;
  repo: string | null;
  agent: AgentInfo | null;
  driverName: string | null;
  /** The viewer's own last instruction, for ↑ on an empty field. */
  recall: string | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [sent, setSent] = useState(false);
  const working = status === "working";
  const disabled = block !== null;

  // Height is driven off scrollHeight rather than a row count: a single
  // logical line wraps into several visual ones in a narrow column, and
  // counting "\n" would under-measure exactly the paste this exists for.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const cs = getComputedStyle(el);
    const chrome = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const line = parseFloat(cs.lineHeight) || 22;
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
    // ↑ on an empty field brings back what you last asked, the way a shell
    // does — the most common edit is "the same thing, slightly different".
    if (e.key === "ArrowUp" && !value && recall) {
      e.preventDefault();
      onChange(recall);
      return;
    }
    if (e.key !== "Enter") return;
    // An IME composing a character uses Enter to commit it; sending there
    // would truncate the word being typed.
    if (e.nativeEvent.isComposing) return;
    // Enter sends, Shift+Enter breaks the line.
    if (e.shiftKey) return;
    e.preventDefault();
    submit();
  }

  const placeholder =
    block?.kind === "offline"
      ? "Start the runner to send instructions"
      : block?.kind === "reconnecting"
        ? "Reconnecting…"
        : mode === "suggest"
          ? driverName
            ? `Suggest something to ${driverName}…`
            : "Suggest an instruction…"
          : working
            ? "Queue the next instruction…"
            : repo
              ? `Ask the agent to do something in ${repo}…`
              : "Ask the agent to do something…";

  const canSubmit = !disabled && value.trim().length > 0;
  const sendLabel = mode === "suggest" ? "Suggest" : working ? "Queue" : "Send";

  return (
    <form
      onSubmit={handleSubmit}
      className={`composer${disabled ? " composer--disabled" : ""}`}
      aria-label={mode === "suggest" ? "Suggest an instruction" : "Instruction for the agent"}
    >
      <Textarea
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
          {block?.kind === "offline" ? (
            <span className="composer-offline">
              <CircleAlert size={14} />
              No agent connected
              <RunnerCommand />
            </span>
          ) : block?.kind === "reconnecting" ? (
            <span className="composer-offline composer-offline--quiet">
              <span className="live-dot composer-reconnect-dot" aria-hidden />
              Reconnecting — your seat is held for 30s
            </span>
          ) : (
            <>
              {repo && (
                <span className="composer-chip" title={`Working on ${repo}`}>
                  <GitBranch size={13} />
                  {repo}
                </span>
              )}
              {agent && (
                <span
                  className="composer-chip composer-chip--model"
                  title={agent.runnerConnected ? "The agent that will run this" : "No agent connected"}
                >
                  {agentLabel(agent)}
                </span>
              )}
            </>
          )}
        </div>

        <div className="composer-actions">
          {sent && (
            <span className="composer-sent" role="status">
              Sent{driverName ? ` to ${driverName}` : ""}
            </span>
          )}
          {mode === "send" && working && !disabled && (
            <>
              {queued > 0 && (
                <span className="composer-queued" title="Waiting behind the current run">
                  {queued} queued
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="composer-stop"
                onClick={onStop}
              >
                <Square size={11} strokeWidth={2.5} />
                Stop
              </Button>
            </>
          )}
          <Button
            type="submit"
            size="icon"
            className="composer-send"
            disabled={!canSubmit}
            aria-label={sendLabel}
            title={sendLabel}
          >
            <ArrowUp size={16} strokeWidth={2.25} />
          </Button>
        </div>
      </div>
    </form>
  );
}
