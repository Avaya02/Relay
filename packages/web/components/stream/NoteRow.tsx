"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Event } from "@relay/shared";
import { CodeBlock, TableWrap } from "./CodeBlock";

const components = { pre: CodeBlock, table: TableWrap };

export function NoteRow({ event }: { event: Event }) {
  return (
    <div className="step-note markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {String(event.data.text ?? "")}
      </ReactMarkdown>
    </div>
  );
}
