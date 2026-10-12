"use client";

import { useEffect, useRef, useState } from "react";

export function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // Refused clipboard (insecure origin); the text is selectable regardless.
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      className="cmd"
      onClick={copy}
      aria-label={`Copy ${command} to the clipboard`}
    >
      {/* Not selectable, so a hand copy never includes the prompt. */}
      <span className="cmd-prompt" aria-hidden>
        $
      </span>
      <code className="cmd-text">{command}</code>
      <span className={`cmd-state ${copied ? "cmd-state--on" : ""}`} aria-hidden>
        {copied ? "Copied" : "Copy"}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
