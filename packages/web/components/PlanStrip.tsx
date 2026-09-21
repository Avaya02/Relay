"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { PlanItem } from "@relay/shared";
import { PlanMark } from "@/components/stream/PlanMark";

// The agent's own checklist, live. The stream answers "what just happened";
// this answers "where are we going, and how far in" — which a watcher can't
// ask mid-run without interrupting. One row tall when closed.
export function PlanStrip({ plan }: { plan: PlanItem[] }) {
  const [open, setOpen] = useState(false);

  const done = plan.filter((t) => t.status === "completed").length;
  const active = plan.find((t) => t.status === "in_progress") ?? null;
  const allDone = done === plan.length;

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
        <ChevronRight size={12} className="plan-chevron" aria-hidden />
        <span className="plan-label">Plan</span>
        <span
          className="plan-pips"
          role="img"
          aria-label={`${done} of ${plan.length} steps complete`}
        >
          {plan.map((t, i) => (
            <span key={i} className={`plan-pip plan-pip--${t.status}`} aria-hidden />
          ))}
        </span>
        <span className={active ? "plan-now plan-now--active" : "plan-now"}>{label}</span>
        <span className="plan-count">
          {done}/{plan.length}
        </span>
      </button>

      {open && (
        <ol className="plan-list">
          {plan.map((t, i) => (
            <li key={i} className={`plan-item plan-item--${t.status}`}>
              <span className="plan-mark">
                <PlanMark status={t.status} />
              </span>
              <span className="plan-text">
                {t.status === "in_progress" ? (t.activeForm ?? t.content) : t.content}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
