"use client";

import { Check, Copy } from "lucide-react";
import { PlanMark } from "./PlanMark";
import type { DiffLine, ToolDetail } from "@relay/shared";
import { useCopy } from "@/components/session/useCopy";

export function StepDetail({ detail }: { detail: ToolDetail }) {
  if (detail.type === "diff") {
    return (
      <div className="step-detail">
        <div className="step-detail-head">
          <span>{detail.path}</span>
        </div>
        <pre className="diff">
          {detail.lines.map((line, i) => (
            <DiffRow key={i} line={line} />
          ))}
        </pre>
      </div>
    );
  }
  if (detail.type === "plan") {
    // The same checklist the plan strip shows, frozen at this moment in the
    // run — "what did the plan look like back then", which the live strip
    // can't answer.
    return (
      <div className="step-detail">
        <ol className="plan-list plan-list--inline">
          {detail.todos.map((t, i) => (
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
      </div>
    );
  }
  return <TextDetail text={detail.text} />;
}

function TextDetail({ text }: { text: string }) {
  const { copied, copy } = useCopy();
  const lines = text.split("\n").length;
  return (
    <div className="step-detail">
      <div className="step-detail-head">
        <span>
          output · {lines} {lines === 1 ? "line" : "lines"}
        </span>
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          onClick={() => copy(text)}
          data-copied={copied || undefined}
          aria-label={copied ? "Copied" : "Copy output"}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      <pre className="step-output">{text}</pre>
    </div>
  );
}

export function DiffRow({ line }: { line: DiffLine }) {
  const cls =
    line.op === "+" ? "diff-line diff-add" : line.op === "-" ? "diff-line diff-del" : "diff-line";
  return (
    <span className={cls}>
      <span className="diff-op" aria-hidden>
        {line.op}
      </span>
      {line.text}
      {"\n"}
    </span>
  );
}
