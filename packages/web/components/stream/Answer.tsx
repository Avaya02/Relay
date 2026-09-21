"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { useCopy } from "@/components/session/useCopy";
import { CodeBlock, TableWrap } from "./CodeBlock";
import { useIsNew } from "./newRows";

// A single reply can be a 130-line file listing. Rendered whole it pushes
// every other row off screen. Past this it clamps and opens in place — decided
// from the text during render, not by measuring the node in an effect, so an
// append-heavy surface stays cheap.
const CLAMP_LINES = 14;

const components = { pre: CodeBlock, table: TableWrap };

export function Answer({ seq, text }: { seq: number; text: string }) {
  const [open, setOpen] = useState(false);
  const isNew = useIsNew(seq);
  const { copied, copy } = useCopy();
  const lineCount = text.split("\n").length;
  const long = lineCount > CLAMP_LINES || text.length > 1400;

  return (
    <article className="answer" data-new={isNew || undefined}>
      {/* The markdown source, not the rendered text: what people paste this
          into is usually another markdown surface, and a flattened copy loses
          the code fences. */}
      <button
        type="button"
        className="icon-btn icon-btn--sm answer-copy"
        onClick={() => copy(text)}
        data-copied={copied || undefined}
        aria-label={copied ? "Answer copied" : "Copy answer"}
        title="Copy answer"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <div className={long && !open ? "markdown-body answer-clamped" : "markdown-body"}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {text}
        </ReactMarkdown>
      </div>
      {long && (
        <button
          type="button"
          className="answer-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "Show less" : `Show all ${lineCount} lines`}
        </button>
      )}
    </article>
  );
}
