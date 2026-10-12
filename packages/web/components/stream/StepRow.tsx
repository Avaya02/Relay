"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_OUT } from "@/lib/ease";
import { VerbIcon } from "./verbIcon";
import { StepDetail } from "./StepDetail";
import { detailOf, durationOf, isPlanUpdate, verbOf, type ActionRow } from "./rows";

// An opened detail would glide out of the live window, so the card stops capping while any is open.
export const DetailOpenCtx = createContext<(delta: 1 | -1) => void>(() => {});

function useReportOpen(open: boolean) {
  const report = useContext(DetailOpenCtx);
  useEffect(() => {
    if (!open) return;
    report(1);
    return () => report(-1);
  }, [open, report]);
}

function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function StepRow({ row }: { row: ActionRow }) {
  const [open, setOpen] = useState(false);
  useReportOpen(open);
  const verb = verbOf(row.call);
  const target = String(row.call.data.target ?? "");
  const ok = row.result ? row.result.data.ok !== false : null;
  const summary = row.result ? String(row.result.data.summary ?? "") : null;
  const detail = detailOf(row);
  const duration = durationOf(row.call, row.result);

  const state = ok === null ? "pending" : ok ? "ok" : "fail";
  const cls = `step step--${state}${isPlanUpdate(row.call) ? " step--muted" : ""}`;

  const body = (
    <>
      <VerbIcon verb={verb} />
      <span className="step-verb">{verb}</span>
      <span className="step-target" title={target}>
        {target}
      </span>
      <span className="step-result">{summary ?? "working…"}</span>
      <span className="step-duration">{duration ?? ""}</span>
      <span className="step-mark" aria-hidden>
        {ok === null ? (
          <span className="live-dot" />
        ) : ok ? (
          <Check size={12} strokeWidth={2.25} />
        ) : (
          <X size={12} strokeWidth={2.25} />
        )}
      </span>
    </>
  );

  if (!detail) {
    return (
      <div className={cls}>
        <div className="step-row">{body}</div>
      </div>
    );
  }

  return (
    <div className={cls}>
      <button
        type="button"
        className="step-row"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${verb} ${target}${summary ? `, ${summary}` : ""}. ${open ? "Hide" : "Show"} detail.`}
      >
        {body}
      </button>
      <Reveal open={open}>
        <StepDetail detail={detail} />
      </Reveal>
    </div>
  );
}

export function FoldedSteps({ verb, rows }: { verb: string; rows: ActionRow[] }) {
  const [open, setOpen] = useState(false);
  useReportOpen(open);
  const last = rows[rows.length - 1];
  const settled = rows.every((r) => r.result);
  const first = rows[0].call;
  const duration = settled ? durationOf(first, last.result) : null;

  return (
    <div className={`step step--${settled ? "ok" : "pending"}`}>
      <button
        type="button"
        className="step-row"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight size={12} className={`step-icon${open ? " step-icon--open" : ""}`} aria-hidden />
        <span className="step-verb">{verb}</span>
        <span className="step-target">
          {rows.length} {rows.length === 1 ? "item" : "items"}{" "}
          <span className="step-count">· {String(first.data.target ?? "")} …</span>
        </span>
        <span className="step-result">{settled ? "" : "working…"}</span>
        <span className="step-duration">{duration ?? ""}</span>
        <span className="step-mark" aria-hidden>
          {settled ? <Check size={12} strokeWidth={2.25} /> : <span className="live-dot" />}
        </span>
      </button>
      <Reveal open={open}>
        <ol className="step-fold">
          {rows.map((r) => (
            <li key={r.call.seq}>
              <StepRow row={r} />
            </li>
          ))}
        </ol>
      </Reveal>
    </div>
  );
}
