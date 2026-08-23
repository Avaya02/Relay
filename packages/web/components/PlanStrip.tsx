"use client";

import { useState } from "react";
import type { PlanItem } from "@relay/shared";

// The agent's own checklist, live.
//
// Relay's job is watching, and most people in a session are watching rather
// than driving — they can't ask "where are we?" mid-run. The ledger answers
// "what just happened"; this answers "where are we going, and how far in".
// Together they're a flight recorder and a flight plan.
//
// Collapsed by default to a single dense row (dots + the step currently
// running + a count), because the ledger is the product and nothing above it
// may compete for attention (PRODUCT.md principle 1). Expands in place.

export function PlanStrip({ plan }: { plan: PlanItem[] }) {
  const [open, setOpen] = useState(false);

  const done = plan.filter((t) => t.status === "completed").length;
  const active = plan.find((t) => t.status === "in_progress") ?? null;
  const allDone = done === plan.length;

  // What the row says when it's closed: the running step if there is one,
  // otherwise an honest resting state.
  const label = active
    ? (active.activeForm ?? active.content)
    : allDone
      ? "All steps complete"
      : "Waiting to start";

  return (
    <div className={allDone ? "plan plan--complete" : "plan"}>
      <button
        type="button"
        className="plan-bar"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="plan-chevron" aria-hidden>
          {open ? "⌄" : "›"}
        </span>
        <span className="plan-label">Plan</span>

        {/* One pip per step — the shape of the whole task at a glance,
            readable without counting and without reading. */}
        <span
          className="plan-pips"
          role="img"
          aria-label={`${done} of ${plan.length} steps complete`}
        >
          {plan.map((t, i) => (
            <span
              key={i}
              className={`plan-pip plan-pip--${t.status}`}
              aria-hidden
            />
          ))}
        </span>

        <span className={active ? "plan-now plan-now--active" : "plan-now"}>
          {label}
        </span>
        <span className="plan-count">
          {done}/{plan.length}
        </span>
      </button>

      {open && (
        <ol className="plan-list">
          {plan.map((t, i) => (
            <li key={i} className={`plan-item plan-item--${t.status}`}>
              <span className="plan-mark" aria-hidden>
                {t.status === "completed"
                  ? "✓"
                  : t.status === "in_progress"
                    ? "▸"
                    : "·"}
              </span>
              <span className="plan-text">
                {t.status === "in_progress"
                  ? (t.activeForm ?? t.content)
                  : t.content}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
