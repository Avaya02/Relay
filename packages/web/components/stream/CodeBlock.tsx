"use client";

import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { CodeBlock as HighlightedCode } from "@/components/agents/code-block";
import { useCopy } from "@/components/session/useCopy";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

// A two-line snippet with a gutter reads as a form, not code.
const NUMBER_FROM = 4;

// Copies the source text, not the rendered DOM.
export function CodeBlock({ children }: { children?: ReactNode }) {
  const { copy } = useCopy();
  const code = Children.toArray(children).find(isValidElement) as
    | ReactElement<{ className?: string; children?: ReactNode }>
    | undefined;
  const lang = /language-([\w+-]+)/.exec(code?.props.className ?? "")?.[1] ?? "text";
  const text = textOf(children).replace(/\n$/, "");

  return (
    <HighlightedCode
      className="codeblock"
      code={text}
      language={lang}
      showLineNumbers={text.split("\n").length >= NUMBER_FROM}
      maxHeight={420}
      onCopy={() => copy(text)}
    />
  );
}

export function TableWrap({ children }: { children?: ReactNode }) {
  return (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  );
}
