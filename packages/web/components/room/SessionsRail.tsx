"use client";

import Link from "next/link";
import { PanelLeftClose, Plus, X } from "lucide-react";
import {
  bucketOf,
  forgetSession,
  shortAgo,
  useRecentSessions,
  type RecentSession,
} from "@/lib/recentSessions";
import { RunnerCommand } from "./agent";
import { Tip } from "./pop";

// The way back. See lib/recentSessions.ts for why this is localStorage and
// not an account: a reverse-chronological list in date buckets, answering
// "what was I just in?", not a calendar.
export function SessionsRail({
  currentId,
  onClose,
}: {
  currentId?: string;
  onClose: () => void;
}) {
  const { sessions, now } = useRecentSessions();

  return (
    <aside className="srail" aria-label="Sessions">
      <div className="srail-head">
        <Link href="/" className="room-wordmark" aria-label="Relay home">
          relay
        </Link>
        <div className="srail-head-actions">
          <Tip label="New session">
            <Link className="rbtn rbtn--icon" href="/" aria-label="Start a new session">
              <Plus size={16} />
            </Link>
          </Tip>
          <Tip label="Hide sessions">
            <button
              type="button"
              className="rbtn rbtn--icon"
              onClick={onClose}
              aria-label="Hide sessions"
            >
              <PanelLeftClose size={16} />
            </button>
          </Tip>
        </div>
      </div>

      <nav className="srail-body" aria-label="Recent sessions">
        {sessions.length === 0 ? (
          <p className="srail-empty">Sessions you join are remembered here, in this browser.</p>
        ) : (
          <SessionList sessions={sessions} currentId={currentId} now={now} />
        )}
      </nav>

      <div className="srail-foot">
        <p className="srail-foot-text">Host one in your own repository</p>
        <RunnerCommand />
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
        <section key={group.label} className="srail-group">
          <h2 className="srail-group-label">{group.label}</h2>
          <ul className="srail-list">
            {group.items.map((s) => (
              <Row key={s.id} session={s} current={s.id === currentId} now={now} />
            ))}
          </ul>
        </section>
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
    current ? "open now" : shortAgo(session.lastSeen, now),
  ].filter(Boolean);

  return (
    <li className="srail-item" data-current={current || undefined}>
      <Link
        className="srail-link"
        href={`/session/${session.id}`}
        aria-current={current ? "page" : undefined}
      >
        <span className="srail-dot" data-status={session.status} aria-hidden />
        <span className="srail-text">
          <span className="srail-name" title={name}>
            {name}
          </span>
          <span className="srail-meta">{facts.join(" · ")}</span>
        </span>
      </Link>
      <Tip label="Forget on this browser" side="right">
        <button
          type="button"
          className="rbtn rbtn--icon rbtn--xs srail-forget"
          aria-label={`Forget ${name}`}
          onClick={() => forgetSession(session.id)}
        >
          <X size={12} />
        </button>
      </Tip>
    </li>
  );
}
