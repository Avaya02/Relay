"use client";

import { ArrowUp, X } from "lucide-react";
import type { Suggestion } from "@relay/shared";

// The watcher's verb. A suggestion is inert until somebody with the wheel
// promotes it, and promotion goes through the same server path as typing an
// instruction — so the one-writer invariant is untouched.
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
    <ul className="sugg-queue" aria-label="Suggestions waiting for the driver">
      {suggestions.map((s) => {
        // An author can always withdraw their own, even while someone else
        // drives — otherwise a typo is stuck in front of the room.
        const canDismiss = isDriver || s.by === selfId;
        return (
          <li key={s.id} className="sugg-item">
            <span className="sugg-author">{s.by === selfId ? "you" : s.displayName}</span>
            <span className="sugg-text">{s.text}</span>
            <span className="sugg-actions">
              {isDriver && (
                <button
                  type="button"
                  className="sugg-send"
                  onClick={() => onPromote(s.id)}
                  title="Send this to the agent"
                >
                  <ArrowUp size={12} />
                  Send
                </button>
              )}
              {canDismiss && (
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  onClick={() => onDismiss(s.id)}
                  aria-label={`Dismiss suggestion from ${s.displayName}`}
                  title="Dismiss"
                >
                  <X size={13} />
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
