"use client";

import { useState } from "react";
import Link from "next/link";
import {
  bucketOf,
  forgetSession,
  shortAgo,
  useRecentSessions,
  type RecentSession,
} from "@/lib/recentSessions";

// The way back. See lib/recentSessions.ts for why this is localStorage and
// not an account.
//
// Deliberately not a nav tree: it's a short, flat, reverse-chronological list
// with three date buckets, because that's the shape of the question being
// asked ("what was I just in?"). The current session is marked rather than
// filtered out — a list that hides where you are makes you count rows to
// work out where you are.

export function SessionsRail({ currentId }: { currentId?: string }) {
  const { sessions, now } = useRecentSessions();
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="rail rail--collapsed">
        <button
          type="button"
          className="rail-expand"
          onClick={() => setCollapsed(false)}
          title="Show sessions"
          aria-label={`Show sessions — ${sessions.length} remembered`}
        >
          <span aria-hidden>›</span>
          {sessions.length > 0 && (
            <span className="rail-expand-count">{sessions.length}</span>
          )}
        </button>
      </aside>
    );
  }

  return (
    <aside className="rail">
      <div className="rail-head">
        <span className="rail-title">Sessions</span>
        <div className="rail-head-actions">
          <Link className="rail-new" href="/" title="Start a new session">
            +
          </Link>
          <button
            type="button"
            className="rail-collapse"
            onClick={() => setCollapsed(true)}
            title="Hide sessions"
            aria-label="Hide sessions"
          >
            ‹
          </button>
        </div>
      </div>

      <div className="rail-body">
        {sessions.length === 0 ? (
          <p className="rail-empty">
            Sessions you join are remembered here, in this browser.
          </p>
        ) : (
          <SessionList sessions={sessions} currentId={currentId} now={now} />
        )}
      </div>
    </aside>
  );
}

function SessionList({
  sessions,
  currentId,
  now,
}: {
  sessions: RecentSession[];
  currentId?: string;
  // One clock for the whole list, so every row in a bucket agrees about what
  // "today" means. Supplied by the hook — see useRecentSessions.
  now: number;
}) {
  const groups: { label: string; items: RecentSession[] }[] = [];
  for (const s of sessions) {
    const label = bucketOf(s.lastSeen, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(s);
    else groups.push({ label, items: [s] });
  }

  return (
    <>
      {groups.map((group) => (
        <div className="rail-group" key={group.label}>
          <p className="rail-group-label">{group.label}</p>
          <ul className="rail-list">
            {group.items.map((s) => (
              <Row
                key={s.id}
                session={s}
                current={s.id === currentId}
                now={now}
              />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function Row({
  session,
  current,
  now,
}: {
  session: RecentSession;
  current: boolean;
  now: number;
}) {
  // The subtitle is built from what's actually known. A session that was
  // opened and never driven has no files and no runs, and padding that out
  // with "0 files" would be noise dressed as information.
  const facts = [
    session.files > 0
      ? `${session.files} ${session.files === 1 ? "file" : "files"}`
      : null,
    session.runs > 0
      ? `${session.runs} ${session.runs === 1 ? "run" : "runs"}`
      : null,
  ].filter(Boolean);

  return (
    <li className={`rail-item ${current ? "rail-item--current" : ""}`}>
      <Link
        className="rail-link"
        href={`/session/${session.id}`}
        aria-current={current ? "page" : undefined}
      >
        <span className="rail-name">
          <span className="rail-repo">{session.repo ?? session.id}</span>
          {/* Two sessions on the same repo are the normal case, and rows
              labelled only by repo are then indistinguishable. The id
              disambiguates; on the row you're already in, "here" is the more
              useful thing to spend that space on. */}
          {current ? (
            <span className="rail-here">here</span>
          ) : (
            session.repo && (
              <span className="rail-id" title={session.id}>
                {session.id.slice(0, 6)}
              </span>
            )
          )}
        </span>
        <span className="rail-meta">
          {[...facts, shortAgo(session.lastSeen, now)].join(" · ")}
        </span>
      </Link>
      <button
        type="button"
        className="rail-forget"
        // Removes the bookmark, not the session — the link keeps working for
        // anyone who still has it, and saying so avoids a destructive-sounding
        // control that isn't.
        title="Forget this session on this browser"
        aria-label={`Forget ${session.repo ?? session.id}`}
        onClick={() => forgetSession(session.id)}
      >
        ×
      </button>
    </li>
  );
}
