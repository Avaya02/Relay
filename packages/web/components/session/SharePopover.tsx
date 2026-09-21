"use client";

import { Check, ExternalLink, Share2 } from "lucide-react";
import { Popover } from "./Popover";
import { useCopy } from "./useCopy";

/**
 * Getting a second person into the room. The whole product is "share the
 * link", and the differentiator — one driver, everyone else watching, control
 * handed over live — is invisible in a single tab. So: the link, a copy, and
 * a second viewer opened right here to see the lock work.
 */
export function SharePopover({ sessionId }: { sessionId: string }) {
  const { copied, copy } = useCopy();
  const url = typeof window === "undefined" ? "" : window.location.href;

  function openViewer() {
    // A named window, so clicking twice reuses it rather than stacking up
    // viewers nobody asked for.
    window.open(window.location.href, `relay-viewer-${sessionId}`, "noopener");
  }

  return (
    <Popover
      label="Share this session"
      align="right"
      trigger={(props) => (
        <button type="button" className="chrome-btn chrome-btn--label" {...props}>
          <Share2 size={14} />
          <span>Share</span>
        </button>
      )}
    >
      <p className="popover-title">Share this session</p>
      <p className="popover-body">
        Anyone with the link watches the same run, live. One person drives at a
        time.
      </p>
      <div className="share-url">
        <input value={url} readOnly aria-label="Session link" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className={`chrome-btn ${copied ? "" : "chrome-btn--primary"}`}
          onClick={() => copy(window.location.href)}
        >
          {copied ? <Check size={14} /> : null}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <button type="button" className="share-secondary" onClick={openViewer}>
        Open a second viewer <ExternalLink size={12} />
      </button>
      <p className="popover-note">
        The second viewer is you again, in another window — the quickest way to
        watch the driver lock change hands.
      </p>
    </Popover>
  );
}
