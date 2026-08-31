"use client";

import { useEffect, useRef, useState } from "react";

// The landing page's primary action is a command, because sessions are created
// by the CLI and the page has no repository to offer.
//
// The whole block is the button. A command line with a separate small copy
// target makes people aim; making the surface itself the affordance means the
// obvious gesture works.

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
      // Clipboard access can be refused (insecure origin, permissions). The
      // text is selectable either way, so say nothing rather than raise an
      // error about a convenience.
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
      {/* Not selectable: dragging across the line to copy it by hand should
          yield the command, never a shell prompt someone then pastes. */}
      <span className="cmd-prompt" aria-hidden>
        $
      </span>
      <code className="cmd-text">{command}</code>
      <span className={`cmd-state ${copied ? "cmd-state--on" : ""}`} aria-hidden>
        {copied ? "Copied" : "Copy"}
      </span>
      {/* Announced once, rather than on every render of the label above. */}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
