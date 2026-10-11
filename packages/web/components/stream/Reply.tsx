"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Event } from "@relay/shared";
import { StreamingResponse } from "@/components/agents/streaming-response";
import { useCopy } from "@/components/session/useCopy";
import { CodeBlock, TableWrap } from "./CodeBlock";
import { useIsNew } from "./newRows";

// A single reply can be a 130-line file listing. Rendered whole it pushes
// every other row off screen. Past this it clamps and opens in place — decided
// from the text during render, not by measuring the node in an effect, so an
// append-heavy surface stays cheap.
const CLAMP_LINES = 14;

const components = { pre: CodeBlock, table: TableWrap };

/** What came back, on beUI's StreamingResponse: the answer, then its actions and the run's meta. */
export function Reply({ events, aside }: { events: Event[]; aside?: ReactNode }) {
  const isNew = useIsNew(events[0].seq);
  const { copy } = useCopy();
  // The markdown source, not the rendered text: what people paste this into
  // is usually another markdown surface, and a flattened copy loses fences.
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

// Clamped per message, not across the reply: a long listing followed by
// "Done — tests pass." must not fold the conclusion away with the listing.
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
