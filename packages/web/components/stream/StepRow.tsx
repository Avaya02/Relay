"use client";

import { useState } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import { VerbIcon } from "./verbIcon";
import { StepDetail } from "./StepDetail";
import { useIsNew } from "./newRows";
import {
  detailOf,
  durationOf,
  isPlanUpdate,
  verbOf,
  type ActionRow,
  type StepEntry,
} from "./rows";

/** One action: the call, and the result folded into the same row. */
export function StepRow({ row }: { row: ActionRow }) {
  const [open, setOpen] = useState(false);
  const isNew = useIsNew(row.call.seq);
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
      <li className={cls} data-new={isNew || undefined}>
        <div className="step-row">{body}</div>
      </li>
    );
  }

  return (
    <li className={cls} data-new={isNew || undefined}>
      <button
        type="button"
        className="step-row"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${verb} ${target}${summary ? `, ${summary}` : ""}. ${open ? "Hide" : "Show"} detail.`}
      >
        {body}
      </button>
      {open && <StepDetail detail={detail} />}
    </li>
  );
}

/** A run of identical verbs, folded to one line with the rows behind it. */
export function FoldedSteps({ verb, rows }: { verb: string; rows: ActionRow[] }) {
  const [open, setOpen] = useState(false);
  const last = rows[rows.length - 1];
  const settled = rows.every((r) => r.result);
  const first = rows[0].call;
  const duration = settled ? durationOf(first, last.result) : null;

  return (
    <li className={`step step--${settled ? "ok" : "pending"}`}>
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
      {open && (
        <ol className="step-fold">
          {rows.map((r) => (
            <StepRow key={r.call.seq} row={r} />
          ))}
        </ol>
      )}
    </li>
  );
}

export function StepEntries({ entries }: { entries: StepEntry[] }) {
  return (
    <>
      {entries.map((entry) =>
        entry.kind === "single" ? (
          <StepRow key={entry.row.call.seq} row={entry.row} />
        ) : (
          <FoldedSteps key={`fold-${entry.rows[0].call.seq}`} verb={entry.verb} rows={entry.rows} />
        ),
      )}
    </>
  );
}
