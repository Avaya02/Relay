"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { StepEntries } from "./StepRow";
import { fmtDuration, foldSteps, histogram, type ActionRow } from "./rows";

/**
 * The record of a turn's work. Open while the turn is live — that stream is
 * the product's whole claim to being watchable — and folded to one line once
 * it settles, with the shape of the work still legible on the line.
 */
export function StepsCard({
  actions,
  live,
  working,
  durationMs,
  defaultOpen,
}: {
  actions: ActionRow[];
  live: boolean;
  /** The agent has the floor and no step is pending: show that it's busy. */
  working: boolean;
  durationMs: number | null;
  defaultOpen: boolean;
}) {
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = live || (toggled ?? defaultOpen);
  const n = actions.length;
  const shape = histogram(actions);

  const title = n === 0 ? "No steps yet" : `${n} ${n === 1 ? "step" : "steps"}`;
  const state = live ? "running" : durationMs !== null ? fmtDuration(durationMs) : "";

  return (
    <div className={`steps${live ? " steps--live" : ""}`}>
      <button
        type="button"
        className="steps-head"
        onClick={() => !live && setToggled(!open)}
        aria-expanded={open}
        disabled={live && n === 0}
      >
        <ChevronRight size={13} className="steps-chevron" aria-hidden />
        <span className="steps-title">{title}</span>
        {shape && <span className="steps-histogram">{shape}</span>}
        <span className="steps-state">{state}</span>
      </button>

      {open && (n > 0 || working) && (
        <ol className="steps-list">
          <StepEntries entries={foldSteps(actions)} />
          {working && (
            <li className="step-working" role="status">
              <span className="step-working-dot" aria-hidden />
              Working…
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
