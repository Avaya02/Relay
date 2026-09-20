"use client";

import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { SessionStatus } from "@relay/shared";
import { Button } from "@/components/ui/button";

// Grows to this many rows, then scrolls. Tall enough for a pasted stack trace
// to be readable while writing, short enough that the ledger above it doesn't
// get squeezed out of the viewport.
const MAX_ROWS = 10;

export function Composer({
  onSend,
  status,
  onStop,
}: {
  onSend: (text: string) => void;
  status: SessionStatus;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const working = status === "working";

  // Height is driven off scrollHeight rather than a row count, because a
  // single logical line wraps into several visual ones in a narrow column and
  // counting "\n" would under-measure exactly the paste this exists for.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const cs = getComputedStyle(el);
    // scrollHeight covers content and padding but never the border, and the
    // box is border-box here — so the border has to be added back or the
    // field sits permanently two pixels short of its own content and scrolls.
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const chrome =
      parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + border;
    const line = parseFloat(cs.lineHeight) || 20;
    el.style.height = `${Math.min(el.scrollHeight + border, line * MAX_ROWS + chrome)}px`;
  }, [text]);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line. The server keeps newlines
    // precisely so a stack trace survives as one instruction, and until this
    // was a textarea there was no way to type one.
    if (e.key !== "Enter" || e.shiftKey) return;
    // An IME composing a character uses Enter to commit it; sending there
    // would truncate the word being typed.
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  }

  return (
    <form onSubmit={handleSubmit} className="composer">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        // Says what happens to it, since a run is already in flight and the
        // server queues rather than interrupts.
        placeholder={
          working ? "Queue the next instruction…" : "Type an instruction…"
        }
        aria-label="Instruction for the agent"
        aria-describedby="composer-hint"
        className="composer-input"
      />
      <p id="composer-hint" className="sr-only">
        Press Enter to send, Shift and Enter for a new line.
      </p>
      <div className="composer-actions">
        {working && (
          <button type="button" className="composer-stop" onClick={onStop}>
            Stop
          </button>
        )}
        {/* Same shape as the landing page's primary button, deliberately: this
            is the one control the two registers share, and it should look
            identical in both. */}
        <Button type="submit" disabled={!text.trim()} className="btn-solid">
          {working ? "Queue" : "Send"}
        </Button>
      </div>
    </form>
  );
}
