"use client";

import { useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ListChecks } from "lucide-react";
import type { PlanItem } from "@relay/shared";
import { PlanMark } from "@/components/stream/PlanMark";

// The agent's own checklist, live. The stream answers "what just happened";
// this answers "where are we going, and how far in", which a watcher can't
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
    <div className="rplan" data-complete={allDone || undefined}>
      <button
        type="button"
        className="rplan-bar"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ListChecks size={14} className="rplan-icon" aria-hidden />
        <span className="rplan-label">Plan</span>
        <span
          className="rplan-track"
          role="img"
          aria-label={`${done} of ${plan.length} steps complete`}
          style={{ "--n": plan.length } as CSSProperties}
        >
          {plan.map((t, i) => (
            <span key={i} className="rplan-seg" data-status={t.status} aria-hidden />
          ))}
        </span>
        <span className="rplan-now" data-active={active ? true : undefined}>
          {label}
        </span>
        <span className="rplan-count">
          {done}/{plan.length}
        </span>
        <ChevronDown size={14} className="rplan-chevron" aria-hidden />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="rplan-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
