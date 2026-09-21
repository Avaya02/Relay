"use client";

import { Children, isValidElement, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { useCopy } from "@/components/session/useCopy";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/**
 * react-markdown's `pre`, with a header: the language, and a copy that takes
 * just this block. The copy is of the source text, not the rendered DOM, so
 * what lands in the clipboard is exactly what the agent wrote.
 */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const { copied, copy } = useCopy();
  const code = Children.toArray(children).find(isValidElement) as
    | React.ReactElement<{ className?: string; children?: ReactNode }>
    | undefined;
  const lang = /language-([\w+-]+)/.exec(code?.props.className ?? "")?.[1] ?? "text";
  const text = textOf(children).replace(/\n$/, "");

  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span>{lang}</span>
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          onClick={() => copy(text)}
          data-copied={copied || undefined}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

/** Wide tables scroll in their own box rather than breaking the measure. */
export function TableWrap({ children }: { children?: ReactNode }) {
  return (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  );
}
