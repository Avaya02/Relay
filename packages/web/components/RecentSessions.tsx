"use client";

import Link from "next/link";
import {
  shortAgo,
  useRecentSessions,
  type RecentSession,
} from "@/lib/recentSessions";

// The landing page's half of the sessions list. Same store as the rail
// (lib/recentSessions.ts), but a short "pick up where you left off" strip
// under the call to action, not a navigator — four at most.
//
// Renders nothing when empty, rather than showing an empty-state box.

const MAX = 4;

// repo, else the name you joined as, else nothing — never the raw session
// id. An id is internal plumbing; it tells a visitor nothing they can decide
// to click on, so a session with neither is dropped rather than shown.
function labelFor(s: RecentSession): string {
  return s.repo || s.name;
}

export function RecentSessions() {
  const { sessions, now } = useRecentSessions();

  // Dedupe on the label, not the repo: two rows a visitor can't tell apart
  // are useless to them even when the sessions behind them genuinely differ.
  // Scans the full history (capped at 30 in the store) rather than the first
  // MAX raw entries, so a run of same-repo sessions doesn't crowd out the
  // rest of the list down to one row.
  const seen = new Set<string>();
  const shown: RecentSession[] = [];
  for (const s of sessions) {
    const label = labelFor(s);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    shown.push(s);
    if (shown.length === MAX) break;
  }

  if (shown.length === 0) return null;

  return (
    <div className="recents">
      <p className="recents-label">Or rejoin</p>
      <ul className="recents-list">
        {shown.map((s) => (
          <li key={s.id}>
            <Link className="recents-link" href={`/session/${s.id}`}>
              <span className="recents-name">{labelFor(s)}</span>
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
