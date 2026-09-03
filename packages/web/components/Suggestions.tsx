"use client";

import { useState, type FormEvent } from "react";
import type { Suggestion } from "@relay/shared";

// The verb watchers were missing. Before this, everyone who wasn't driving
// could only watch — which made "multiplayer" true of the infrastructure and
// not of the experience.
//
// The split is deliberate and mirrors the lock itself:
//   watcher  — proposes. Text goes nowhere near the agent.
//   driver   — sees proposals and decides. Sending is still one person's act.
//
// So the one-writer invariant is untouched: a suggestion is inert until
// somebody with the wheel promotes it, and promotion goes through the same
// server path as typing an instruction.

export function SuggestionQueue({
  suggestions,
  isDriver,
  selfId,
  onPromote,
  onDismiss,
}: {
  suggestions: Suggestion[];
  isDriver: boolean;
  selfId: string | null;
  onPromote: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="sugg-queue">
      <div className="sugg-queue-head">
        <span className="sugg-queue-title">
          {suggestions.length === 1 ? "1 suggestion" : `${suggestions.length} suggestions`}
        </span>
        {isDriver && <span className="sugg-queue-hint">you decide what runs</span>}
      </div>

      <ul className="sugg-list">
        {suggestions.map((s) => {
          // An author can always withdraw their own, even while someone else
          // drives — otherwise a typo is stuck in front of the room.
          const canDismiss = isDriver || s.by === selfId;
          return (
            <li key={s.id} className="sugg-item">
              <span className="sugg-author">{s.displayName}</span>
              <span className="sugg-text">{s.text}</span>
              <span className="sugg-actions">
                {isDriver && (
                  <button
                    type="button"
                    className="sugg-send"
                    onClick={() => onPromote(s.id)}
                    title="Send this to the agent"
                  >
                    Send
                  </button>
                )}
                {canDismiss && (
                  <button
                    type="button"
                    className="sugg-drop"
                    onClick={() => onDismiss(s.id)}
                    aria-label={`Dismiss suggestion from ${s.displayName}`}
                    title="Dismiss"
                  >
                    ×
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SuggestBox({
  onSuggest,
  disabled,
}: {
  onSuggest: (text: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSuggest(trimmed);
    setText("");
    // The suggestion joins a list the driver sees, which on a watcher's own
    // screen is easy to miss — so say plainly that it landed.
    setSent(true);
    setTimeout(() => setSent(false), 2400);
  }

  return (
    <form className="sugg-box" onSubmit={handleSubmit}>
      <input
        className="sugg-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Suggest an instruction…"
        aria-label="Suggest an instruction to the driver"
        maxLength={2000}
        disabled={disabled}
        spellCheck={false}
      />
      <button type="submit" className="sugg-submit" disabled={disabled || !text.trim()}>
        {sent ? "Sent" : "Suggest"}
      </button>
    </form>
  );
}
