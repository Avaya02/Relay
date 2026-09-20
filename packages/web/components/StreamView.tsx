"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  DiffLine,
  Event,
  Participant,
  ToolDetail,
} from "@relay/shared";

// The action ledger (DESIGN.md § signature surface).
//
// Three ideas do most of the work here:
//  1. ONE row per action. A tool_call and its tool_result are the same row —
//     the row appears the instant the call is made, in a pending state, and
//     completes in place when the result lands. A 32-event run reads as ~13
//     rows instead of 26.
//  2. ONE continuous left rule down the whole ledger, with rows hanging off
//     it — not a per-row border, which renders as a dashed ladder of stubs.
//  3. Detail is collapsed, never truncated away. Diffs and bulk output live
//     behind a disclosure so the summary line stays scannable.

type Row =
  | { type: "instruction"; event: Event; turn: number; first: boolean }
  | { type: "text"; event: Event }
  | { type: "action"; event: Event; result: Event | null }
  | { type: "done"; event: Event }
  | { type: "error"; event: Event };

// Fold each tool_result into the tool_call it belongs to. Results are matched
// by the server-assigned tool id; an unmatched result (possible only if a
// history replay is cut mid-action) degrades to its own row rather than
// vanishing.
function buildRows(events: Event[]): Row[] {
  const resultsByCallId = new Map<string, Event>();
  for (const e of events) {
    if (e.kind === "tool_result" && typeof e.data.id === "string") {
      resultsByCallId.set(e.data.id, e);
    }
  }

  const consumed = new Set<string>();
  const rows: Row[] = [];
  // Turns are counted here rather than stored on the event: an instruction IS
  // the turn boundary, so the number falls out of the transcript everyone
  // already has, and a late joiner counts the same way from the same replay.
  let turn = 0;
  for (const event of events) {
    switch (event.kind) {
      case "user_instruction":
        turn++;
        rows.push({
          type: "instruction",
          event,
          turn,
          // The first instruction opens the session; it needs no rule above it
          // separating it from the nothing that precedes it.
          first: rows.length === 0,
        });
        break;
      case "agent_text":
        rows.push({ type: "text", event });
        break;
      case "tool_call": {
        const id = typeof event.data.id === "string" ? event.data.id : null;
        const result = id ? (resultsByCallId.get(id) ?? null) : null;
        if (result) consumed.add(result.seq.toString());
        rows.push({ type: "action", event, result });
        break;
      }
      case "tool_result":
        if (!consumed.has(event.seq.toString())) {
          rows.push({ type: "action", event: event, result: event });
        }
        break;
      case "agent_done":
        rows.push({ type: "done", event });
        break;
      case "agent_error":
        rows.push({ type: "error", event });
        break;
    }
  }
  return rows;
}

// A turn is the unit a reader actually thinks in: one thing asked, one answer
// back, and the work in between. Grouping by it is what lets finished work
// fold away while the answer it produced stays on the page.
type Turn = {
  key: string;
  instruction: Extract<Row, { type: "instruction" }> | null;
  rows: Row[];
  /** No terminal row yet, so this turn is the one happening now. */
  live: boolean;
};

function groupTurns(rows: Row[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (const row of rows) {
    if (row.type === "instruction") {
      current = { key: `t${row.event.seq}`, instruction: row, rows: [], live: true };
      turns.push(current);
      continue;
    }
    // A replay can open mid-run, with actions arriving before any instruction
    // this viewer ever saw. They belong to a turn whose prompt is off-screen,
    // not to nothing.
    if (!current) {
      current = { key: "t0", instruction: null, rows: [], live: true };
      turns.push(current);
    }
    current.rows.push(row);
    if (row.type === "done" || row.type === "error") current.live = false;
  }
  return turns;
}

/** The one-line stand-in a finished turn's steps collapse into. */
function stepSummary(turn: Turn): string {
  const steps = turn.rows.filter((r) => r.type === "action").length;
  const done = turn.rows.find((r) => r.type === "done");
  const parts: string[] = [`${steps} ${steps === 1 ? "step" : "steps"}`];
  if (done) {
    const d = done.event.data as { durationMs?: number; costUsd?: number };
    if (typeof d.durationMs === "number") parts.push(`${(d.durationMs / 1000).toFixed(1)}s`);
    if (typeof d.costUsd === "number") parts.push(`$${d.costUsd.toFixed(4)}`);
  }
  return parts.join("  ·  ");
}

export function StreamView({
  events,
  participants,
  selfId,
  emptyHint,
}: {
  events: Event[];
  participants: Participant[];
  selfId: string | null;
  // Written by the caller because only it knows the viewer's role — a
  // watcher with no composer must not be told to type an instruction.
  emptyHint: string;
}) {
  const scrollerRef = useRef<HTMLElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  // Event count as of the last time the viewer was at the bottom. Only ever
  // written from the scroll handler: while pinned, `missed` is 0 regardless,
  // so the only moment this needs to be accurate is when the user scrolls
  // away — and auto-scrolling fires a scroll event too, which keeps it fresh.
  const [seenAtBottom, setSeenAtBottom] = useState(0);

  const rows = useMemo(() => buildRows(events), [events]);
  const turns = useMemo(() => groupTurns(rows), [rows]);
  const missed = pinnedToBottom ? 0 : Math.max(0, events.length - seenAtBottom);

  // Only auto-scroll when the viewer was already at the bottom. Scrolling up
  // to read back through a run must not be yanked away by the next event —
  // previously this called scrollIntoView unconditionally on every append,
  // which measurably dragged the viewport from 0 back to 245px mid-run.
  // Keeps the live event count reachable from the scroll listener, which is
  // attached once and would otherwise close over a stale value.
  const eventCountRef = useRef(events.length);
  useEffect(() => {
    eventCountRef.current = events.length;
  });

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !pinnedToBottom) return;
    el.scrollTop = el.scrollHeight;
    // Keyed on event count only: re-running when `pinnedToBottom` flips would
    // scroll the user back down the instant they scrolled up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      // 24px of slack so a resting scroll position that's a hair off the
      // bottom still counts as pinned.
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      setPinnedToBottom(atBottom);
      if (atBottom) setSeenAtBottom(eventCountRef.current);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function jumpToLatest() {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setPinnedToBottom(true);
    setSeenAtBottom(events.length);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <main
        ref={scrollerRef}
        className="ledger flex-1 overflow-y-auto px-4 py-4"
        // The ledger is the streaming surface: announce new entries politely
        // so a screen-reader user is told what the agent did.
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Agent action ledger"
      >
        {rows.length === 0 ? (
          <div className="ledger-empty">
            <p className="ledger-empty-title">No actions recorded yet</p>
            <p className="ledger-empty-hint">{emptyHint}</p>
          </div>
        ) : (
          <div className="ledger-rail flex flex-col">
            {turns.map((turn) => (
              <TurnBlock
                key={turn.key}
                turn={turn}
                participants={participants}
                selfId={selfId}
              />
            ))}
          </div>
        )}
      </main>

      {missed > 0 && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 font-mono text-xs text-[var(--text)] shadow-lg transition-colors hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {missed} new {missed === 1 ? "event" : "events"} ↓
        </button>
      )}
    </div>
  );
}

function timeOf(event: Event): string {
  return new Date(event.ts).toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * One turn: what was asked, what came back, and — folded away once it's over —
 * how it got there.
 *
 * While the agent is working, every step is on screen: that stream is the
 * product's whole claim to being watchable. The moment the turn settles, the
 * steps stop being news and become provenance, so they collapse to a single
 * line beneath the answer. A ten-turn session stays readable as a conversation
 * instead of scrolling as a hundred rows of tool calls.
 */
function TurnBlock({
  turn,
  participants,
  selfId,
}: {
  turn: Turn;
  participants: Participant[];
  selfId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const actionRows = turn.rows.filter((r) => r.type === "action");

  return (
    <section className="turn">
      {turn.instruction && (
        <LedgerRow row={turn.instruction} participants={participants} selfId={selfId} />
      )}

      {turn.rows.map((row) => {
        // Collapsed into the footer below, along with the done row whose
        // numbers the footer is showing.
        if (!turn.live && row.type === "action") return null;
        if (row.type === "done") return null;
        return (
          <LedgerRow
            key={row.event.seq}
            row={row}
            participants={participants}
            selfId={selfId}
          />
        );
      })}

      {!turn.live && (
        <div className="turn-steps">
          {actionRows.length > 0 ? (
            <button
              type="button"
              className="turn-steps-toggle"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              <span className="turn-steps-chevron" aria-hidden>
                ›
              </span>
              {stepSummary(turn)}
            </button>
          ) : (
            // Nothing was run, so there is nothing to open — but the turn's
            // cost and duration are still worth stating.
            <span className="turn-steps-static">{stepSummary(turn)}</span>
          )}

          {open && (
            <div className="turn-steps-list">
              {actionRows.map((row) => (
                <LedgerRow
                  key={row.event.seq}
                  row={row}
                  participants={participants}
                  selfId={selfId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function LedgerRow({
  row,
  participants,
  selfId,
}: {
  row: Row;
  participants: Participant[];
  selfId: string | null;
}) {
  switch (row.type) {
    case "instruction": {
      const { event } = row;
      const name =
        event.by === selfId
          ? "you"
          : (participants.find((p) => p.id === event.by)?.displayName ??
            "someone");
      return (
        <div
          className={`ledger-item ledger-instruction ${
            row.first ? "ledger-instruction--first" : ""
          }`}
        >
          <span className="ledger-turn">turn {row.turn}</span>
          <span className="ledger-instruction-body">
            <span className="ledger-instruction-who">{name}</span>
            <span className="ledger-instruction-arrow"> → </span>
            <span className="ledger-instruction-text">
              {String(event.data.text)}
            </span>
          </span>
        </div>
      );
    }

    case "text":
      return <ProseRow text={String(row.event.data.text)} />;

    case "action":
      return <ActionRow call={row.event} result={row.result} />;

    case "done": {
      const d = row.event.data as {
        steps?: number;
        durationMs?: number;
        costUsd?: number;
      };
      const parts = [
        typeof d.steps === "number" ? `${d.steps} steps` : null,
        typeof d.durationMs === "number"
          ? `${(d.durationMs / 1000).toFixed(1)}s`
          : null,
        typeof d.costUsd === "number" ? `$${d.costUsd.toFixed(4)}` : null,
      ].filter(Boolean);
      return (
        <div className="ledger-item ledger-done">
          — done{parts.length ? ` · ${parts.join(" · ")}` : ""} —
        </div>
      );
    }

    case "error":
      return (
        <div className="ledger-item ledger-error">
          {String(row.event.data.message ?? "agent error")}
        </div>
      );
  }
}

// A single agent reply can be a 130-line file listing. Rendered whole, one
// answer pushes every ledger row off screen and the flight-recorder read is
// gone — the exact failure DESIGN.md's "optimize for the fiftieth event"
// rule is about. Long replies collapse to a readable height and open in
// place.
//
// The decision is made from the text itself during render rather than by
// measuring the node in an effect: measurement would mean writing state from
// an effect on every append, and the whole point is that this surface stays
// cheap when events are arriving several times a second.
const PROSE_CLAMP_LINES = 14;

function ProseRow({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const lineCount = text.split("\n").length;
  const long = lineCount > PROSE_CLAMP_LINES || text.length > 1200;

  if (!long) {
    return (
      <div className="ledger-item markdown-body ledger-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="ledger-item ledger-prose">
      <div
        className={
          open ? "markdown-body" : "markdown-body ledger-prose-clamped"
        }
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
      <button
        type="button"
        className="ledger-prose-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Show less" : `Show all ${lineCount} lines`}
      </button>
    </div>
  );
}

function ActionRow({ call, result }: { call: Event; result: Event | null }) {
  const [open, setOpen] = useState(false);

  const verb = String(call.data.verb ?? call.data.tool ?? "");
  const target = String(call.data.target ?? "");
  const ok = result ? result.data.ok !== false : null;
  const summary = result ? String(result.data.summary ?? "") : null;

  const detail =
    (call.data.detail as ToolDetail | undefined) ??
    (result?.data.detail as ToolDetail | undefined);
  const canExpand = Boolean(detail);

  // A plan update is a timeline marker, not work. The agent revises its
  // checklist often — on a real run that's a third of the rows — and at
  // equal weight they crowd out the reads, edits and test runs that are the
  // actual record. The live state lives in the plan strip; these stay as
  // quiet "it reached step 3 at 19:55:14" anchors.
  const muted = call.data.tool === "TodoWrite";

  // Pending → done is a state change, so it earns the marker swap: ▸ while
  // running, ✓/✗ once resolved. Glyph as well as color, so the row is
  // readable with any form of color blindness.
  const marker = ok === null ? "▸" : ok ? "✓" : "✗";

  const body = (
    <>
      <span
        className={
          ok === false
            ? "ledger-marker text-[var(--state-error)]"
            : ok === null
              ? "ledger-marker text-[var(--accent)]"
              : "ledger-marker text-[var(--text-dim)]"
        }
        aria-hidden
      >
        {marker}
      </span>
      <span className="ledger-verb">{verb}</span>
      <span className="ledger-target" title={target}>
        {target}
      </span>
      <span
        className={
          ok === false
            ? "ledger-result text-[var(--state-error)]"
            : "ledger-result"
        }
        title={summary ?? undefined}
      >
        {summary ?? <span className="ledger-pending">working…</span>}
      </span>
      <span className="ledger-time">{timeOf(call)}</span>
      <span className="ledger-chevron" aria-hidden>
        {canExpand ? (open ? "⌄" : "›") : ""}
      </span>
    </>
  );

  const rowClass = `ledger-item ledger-action${muted ? " ledger-action--muted" : ""}`;

  if (!canExpand) {
    return <div className={rowClass}>{body}</div>;
  }

  return (
    <>
      <button
        type="button"
        className={`${rowClass} ledger-action--expandable`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${verb} ${target}${summary ? `, ${summary}` : ""}. Show detail.`}
      >
        {body}
      </button>
      {open && detail && <DetailPanel detail={detail} />}
    </>
  );
}

function DetailPanel({ detail }: { detail: ToolDetail }) {
  if (detail.type === "diff") {
    return (
      <div className="ledger-detail">
        <div className="ledger-detail-path">{detail.path}</div>
        <pre className="ledger-diff">
          {detail.lines.map((line, i) => (
            <DiffRow key={i} line={line} />
          ))}
        </pre>
      </div>
    );
  }
  if (detail.type === "plan") {
    // The same checklist the plan strip shows, but frozen at this moment in
    // the run — expanding a past TodoWrite row answers "what did the plan
    // look like back then", which the live strip can't.
    return (
      <div className="ledger-detail">
        <ol className="plan-list plan-list--inline">
          {detail.todos.map((t, i) => (
            <li key={i} className={`plan-item plan-item--${t.status}`}>
              <span className="plan-mark" aria-hidden>
                {t.status === "completed"
                  ? "✓"
                  : t.status === "in_progress"
                    ? "▸"
                    : "·"}
              </span>
              <span className="plan-text">
                {t.status === "in_progress"
                  ? (t.activeForm ?? t.content)
                  : t.content}
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return (
    <div className="ledger-detail">
      <pre className="ledger-output">{detail.text}</pre>
    </div>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  const cls =
    line.op === "+"
      ? "diff-line diff-add"
      : line.op === "-"
        ? "diff-line diff-del"
        : "diff-line";
  return (
    <span className={cls}>
      <span className="diff-op" aria-hidden>
        {line.op}
      </span>
      {line.text}
      {"\n"}
    </span>
  );
}
