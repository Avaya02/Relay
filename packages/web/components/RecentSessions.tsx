"use client";

import Link from "next/link";
import { shortAgo, useRecentSessions } from "@/lib/recentSessions";

// The landing page's half of the sessions list. Same store as the rail
// (lib/recentSessions.ts), deliberately a different shape: this is a short
// "pick up where you left off" strip under the call to action, not a
// navigator. Four at most — past that it competes with the thing the page is
// actually for.
//
// Renders nothing at all when empty. An empty-state box on a landing page is
// a promise of content the visitor has no way to produce yet.

const MAX = 4;

export function RecentSessions() {
  const { sessions, now } = useRecentSessions();
  if (sessions.length === 0) return null;

  const shown = sessions.slice(0, MAX);

  return (
    <div className="recents">
      <p className="recents-label">Or rejoin</p>
      <ul className="recents-list">
        {shown.map((s) => (
          <li key={s.id}>
            <Link className="recents-link" href={`/session/${s.id}`}>
              <span className="recents-name">{s.repo ?? s.id}</span>
              <span className="recents-meta">
                {[
                  s.files > 0
                    ? `${s.files} ${s.files === 1 ? "file" : "files"}`
                    : null,
                  shortAgo(s.lastSeen, now),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
