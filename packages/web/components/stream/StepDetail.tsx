"use client";

import { CodeBlock as HighlightedCode } from "@/components/agents/code-block";
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
    // The plan as it stood at this point in the run, which the live strip can't show.
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
  const { copy } = useCopy();
  const lines = text.split("\n").length;
  return (
    <HighlightedCode
      className="codeblock step-code"
      code={text}
      language="text"
      filename={`output · ${lines} ${lines === 1 ? "line" : "lines"}`}
      showLineNumbers={lines > 1}
      wrap
      maxHeight={352}
      onCopy={() => copy(text)}
    />
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
