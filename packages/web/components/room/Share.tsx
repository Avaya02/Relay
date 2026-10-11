"use client";

import { Check, ExternalLink, Link2 } from "lucide-react";
import { useCopy } from "@/components/session/useCopy";
import { RoomPopover } from "./pop";

/**
 * Getting a second person into the room. One driver and everyone else
 * following is invisible in a single tab, so the panel also opens a second
 * viewer right here to watch the wheel change hands.
 */
export function Share({ sessionId }: { sessionId: string }) {
  const { copied, copy } = useCopy();
  const url = typeof window === "undefined" ? "" : window.location.href;

  return (
    <RoomPopover
      label="Share this session"
      width="22rem"
      trigger={
        <button type="button" className="rbtn rbtn--secondary" aria-label="Share">
          <Link2 size={14} aria-hidden />
          <span className="share-label">Share</span>
        </button>
      }
    >
      <div className="rpop-section">
        <p className="rpop-title">Share this session</p>
        <p className="rpop-body">
          Anyone with the link sees the same run, live. One person has the wheel at a time.
        </p>
        <div className="share-url">
          <input
            value={url}
            readOnly
            aria-label="Session link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            className="rbtn rbtn--primary rbtn--sm"
            onClick={() => copy(window.location.href)}
          >
            {copied && <Check size={13} aria-hidden />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
      <div className="rpop-section">
        <button
          type="button"
          className="rbtn rbtn--ghost rbtn--sm share-viewer"
          onClick={() =>
            // Named, so a second click reuses the window instead of stacking viewers.
            window.open(window.location.href, `relay-viewer-${sessionId}`, "noopener")
          }
        >
          Open a second viewer <ExternalLink size={12} aria-hidden />
        </button>
        <p className="rpop-note">
          It&apos;s you again, in another window: the quickest way to see the wheel change
          hands.
        </p>
      </div>
    </RoomPopover>
  );
}
