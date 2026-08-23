"use client";

import { useEffect, useRef, useState } from "react";

// Getting a second person into the room.
//
// The whole product is "share the link", and until now sharing the link meant
// selecting the address bar. Worse, the differentiator — one driver, everyone
// else watching, control handed over live — is completely invisible in a
// single tab, which is the state every first-time visitor is in.
//
// So: copy the link, or open a second viewer right here. The second one is
// the demo. One click and the lock is a thing you can see working rather than
// a claim in a README.

export function ShareControls({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clearing on unmount matters here: the confirmation is a timer writing to
  // state, and the header unmounts whenever the session view is replaced.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Denied permission, or a non-secure origin (clipboard needs HTTPS or
      // localhost). Falling back to a selection keeps the action possible
      // instead of silently doing nothing.
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand("copy");
      } catch {
        // Nothing left to try; the URL is still in the address bar.
      }
      input.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  function openViewer() {
    // A named window, so clicking twice reuses the same one rather than
    // stacking up viewers nobody asked for.
    window.open(window.location.href, `relay-viewer-${sessionId}`, "noopener");
  }

  return (
    <div className="share">
      <button
        type="button"
        className="share-button"
        onClick={copy}
        aria-live="polite"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      <button
        type="button"
        className="share-button"
        onClick={openViewer}
        title="Open this session in a second window, to watch the driver lock work"
      >
        Second viewer
      </button>
    </div>
  );
}
