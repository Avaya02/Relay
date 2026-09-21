"use client";

import { useState } from "react";
import Link from "next/link";
import { PanelLeft, PanelLeftClose, Plus, X } from "lucide-react";
import {
  bucketOf,
  forgetSession,
  shortAgo,
  useRecentSessions,
  type RecentSession,
} from "@/lib/recentSessions";

// The way back. See lib/recentSessions.ts for why this is localStorage and
// not an account. A flat, reverse-chronological list in three date buckets:
// the question is "what was I just in?", and a calendar answers a question
// nobody asked.
export function SessionsRail({ currentId }: { currentId?: string }) {
  const { sessions, now } = useRecentSessions();
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="rail rail--collapsed">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setCollapsed(false)}
          title="Show sessions"
          aria-label={`Show sessions — ${sessions.length} remembered`}
        >
          <PanelLeft size={15} />
        </button>
        {sessions.length > 0 && <span className="rail-count">{sessions.length}</span>}
      </aside>
    );
  }

  return (
    <aside className="rail">
      <div className="rail-head">
        <span className="rail-title">Sessions</span>
        <div className="rail-head-actions">
          <Link className="icon-btn" href="/" title="Start a new session" aria-label="Start a new session">
            <Plus size={15} />
          </Link>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setCollapsed(true)}
            title="Hide sessions"
            aria-label="Hide sessions"
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
      </div>

      <div className="rail-body">
        {sessions.length === 0 ? (
          <p className="rail-empty">Sessions you join are remembered here, in this browser.</p>
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
        <div key={group.label}>
          <p className="rail-group-label">{group.label}</p>
          <ul className="rail-list">
            {group.items.map((s) => (
              <Row key={s.id} session={s} current={s.id === currentId} now={now} />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function Row({ session, current, now }: { session: RecentSession; current: boolean; now: number }) {
  // The first instruction is what the session was about; the repo is where.
  // A session nobody drove yet has only the where.
  const name = session.title || session.repo || session.id;
  const facts = [
    session.title ? session.repo : null,
    session.runs > 0 ? `${session.runs} ${session.runs === 1 ? "run" : "runs"}` : null,
    current ? "here" : shortAgo(session.lastSeen, now),
  ].filter(Boolean);

  return (
    <li className={`rail-item${current ? " rail-item--current" : ""}`}>
      <Link className="rail-link" href={`/session/${session.id}`} aria-current={current ? "page" : undefined}>
        <span className={`rail-dot rail-dot--${session.status}`} aria-hidden />
        <span className="rail-text">
          <span className="rail-name" title={name}>
            {name}
          </span>
          <span className="rail-meta">{facts.join(" · ")}</span>
        </span>
      </Link>
      <button
        type="button"
        className="icon-btn icon-btn--sm rail-forget"
        title="Forget this session on this browser"
        aria-label={`Forget ${name}`}
        onClick={() => forgetSession(session.id)}
      >
        <X size={12} />
      </button>
    </li>
  );
}
