"use client";

import Link from "next/link";
import {
  shortAgo,
  useRecentSessions,
  type RecentSession,
} from "@/lib/recentSessions";

const MAX = 4;

// Never the raw id: it tells a visitor nothing to click on, so sessions with
// neither repo nor name are dropped.
function labelFor(s: RecentSession): string {
  return s.repo || s.name;
}

export function RecentSessions() {
  const { sessions, now } = useRecentSessions();

  // Dedupe on the label, since identical-looking rows are useless. Scan the full
  // history, not the first MAX, so same-repo runs don't crowd out the rest.
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
