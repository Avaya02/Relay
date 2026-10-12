"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Event } from "@relay/shared";
import { StreamingResponse } from "@/components/agents/streaming-response";
import { useCopy } from "@/components/session/useCopy";
import { CodeBlock, TableWrap } from "./CodeBlock";
import { useIsNew } from "./newRows";

// A reply can be a 130-line listing that pushes every other row off screen. Decided
// from the text during render, not by measuring in an effect, to stay cheap.
const CLAMP_LINES = 14;

const components = { pre: CodeBlock, table: TableWrap };

export function Reply({ events, aside }: { events: Event[]; aside?: ReactNode }) {
  const isNew = useIsNew(events[0].seq);
  const { copy } = useCopy();
  // Markdown source, not rendered text: a flattened copy loses code fences.
  const source = events.map(textOf).join("\n\n");

  return (
    <article className="answer" data-new={isNew || undefined}>
      <StreamingResponse
        status="complete"
        announce={false}
        onCopy={() => copy(source)}
        contentClassName="answer-body"
        actionsClassName="answer-actions"
        aside={aside}
      >
        {events.map((e) => (
          <ReplyPart key={e.seq} text={textOf(e)} />
        ))}
      </StreamingResponse>
    </article>
  );
}

const textOf = (e: Event) => String(e.data.text ?? "");

// Per message, so a long listing doesn't fold away the "Done" after it.
function ReplyPart({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const lineCount = text.split("\n").length;
  const long = lineCount > CLAMP_LINES || text.length > 1400;

  return (
    <div className="answer-part">
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
    </div>
  );
}
