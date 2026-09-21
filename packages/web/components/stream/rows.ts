import type { Event, ToolDetail } from "@relay/shared";

// The transcript, folded into what a reader thinks in: turns.
//
// Everything here is derived from the event list every viewer already has,
// in `seq` order, with nothing stored — so a late joiner replaying `history`
// arrives at the same picture as someone who watched it happen.

export type ActionRow = {
  type: "action";
  call: Event;
  result: Event | null;
};

export type Row =
  | { type: "text"; event: Event }
  | ActionRow
  | { type: "done"; event: Event }
  | { type: "error"; event: Event };

export type Turn = {
  key: string;
  /** Null only for a replay that opens mid-run, before any instruction. */
  instruction: Event | null;
  /** 1-based, counted from instructions — the same number on every screen. */
  number: number;
  rows: Row[];
  /** No terminal row yet: this is the run happening now. */
  live: boolean;
  /** Accepted by the server but waiting behind a run still in flight. */
  queued: boolean;
};

/**
 * Fold each tool_result into the tool_call it belongs to. Results are matched
 * by the server-assigned tool id; an unmatched result (possible only if a
 * history replay is cut mid-action) degrades to its own row rather than
 * vanishing.
 */
function buildRows(events: Event[]): (Row | { type: "instruction"; event: Event })[] {
  const resultsByCallId = new Map<string, Event>();
  for (const e of events) {
    if (e.kind === "tool_result" && typeof e.data.id === "string") {
      resultsByCallId.set(e.data.id, e);
    }
  }

  const consumed = new Set<number>();
  const rows: (Row | { type: "instruction"; event: Event })[] = [];
  for (const event of events) {
    switch (event.kind) {
      case "user_instruction":
        rows.push({ type: "instruction", event });
        break;
      case "agent_text":
        rows.push({ type: "text", event });
        break;
      case "tool_call": {
        const id = typeof event.data.id === "string" ? event.data.id : null;
        const result = id ? (resultsByCallId.get(id) ?? null) : null;
        if (result) consumed.add(result.seq);
        rows.push({ type: "action", call: event, result });
        break;
      }
      case "tool_result":
        if (!consumed.has(event.seq)) {
          rows.push({ type: "action", call: event, result: event });
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

/**
 * Group rows into turns.
 *
 * The server appends a `user_instruction` the moment it accepts one, even
 * while a run is in flight — the text is queued, the event is not. So an
 * instruction that arrives while an earlier turn is still live does not open
 * the turn that subsequent rows belong to: those rows are the earlier run's,
 * and they keep attaching to it until it settles. The new instruction waits
 * as a *queued* turn and becomes the live one when its predecessor ends.
 */
export function groupTurns(events: Event[]): Turn[] {
  const turns: Turn[] = [];
  let number = 0;

  // The turn rows attach to: the earliest one still running.
  const running = () => turns.find((t) => t.live && !t.queued) ?? null;

  for (const row of buildRows(events)) {
    if (row.type === "instruction") {
      number++;
      turns.push({
        key: `t${row.event.seq}`,
        instruction: row.event,
        number,
        rows: [],
        live: true,
        queued: running() !== null,
      });
      continue;
    }

    let target = running();
    if (!target) {
      // A queued turn whose predecessor has settled is the one running now.
      const next = turns.find((t) => t.queued);
      if (next) {
        next.queued = false;
        target = next;
      } else {
        // A replay can open mid-run, with rows arriving before any instruction
        // this viewer ever saw. They belong to a turn whose prompt is
        // off-screen, not to nothing.
        target = { key: "t0", instruction: null, number: 0, rows: [], live: true, queued: false };
        turns.push(target);
      }
    }

    target.rows.push(row);
    if (row.type === "done" || row.type === "error") {
      target.live = false;
      // The run settling is what lets the next queued instruction start.
      const next = turns.find((t) => t.queued);
      if (next) next.queued = false;
    }
  }
  return turns;
}

export function actionsOf(turn: Turn): ActionRow[] {
  return turn.rows.filter((r): r is ActionRow => r.type === "action");
}

export function doneOf(turn: Turn): { steps?: number; durationMs?: number; costUsd?: number } | null {
  const done = turn.rows.find((r) => r.type === "done");
  return done ? (done.event.data as { steps?: number; durationMs?: number; costUsd?: number }) : null;
}

export function verbOf(call: Event): string {
  return String(call.data.verb ?? call.data.tool ?? "");
}

export function isPlanUpdate(call: Event): boolean {
  return call.data.tool === "TodoWrite";
}

export function detailOf(row: ActionRow): ToolDetail | undefined {
  return (
    (row.call.data.detail as ToolDetail | undefined) ??
    (row.result?.data.detail as ToolDetail | undefined)
  );
}

/** "read 4 · edited 2 · ran 1" — the shape of a finished turn's work. */
export function histogram(actions: ActionRow[]): string {
  const counts = new Map<string, number>();
  for (const a of actions) {
    if (isPlanUpdate(a.call)) continue;
    const verb = verbOf(a.call);
    counts.set(verb, (counts.get(verb) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([verb, n]) => `${verb} ${n}`)
    .join(" · ");
}

/**
 * Consecutive actions with the same verb fold into one entry once there are
 * enough of them to read as noise rather than as a record: six reads in a row
 * is "read six files", and the individual paths are one click away.
 */
export const FOLD_AT = 4;

export type StepEntry =
  | { kind: "single"; row: ActionRow }
  | { kind: "fold"; verb: string; rows: ActionRow[] };

export function foldSteps(actions: ActionRow[]): StepEntry[] {
  const out: StepEntry[] = [];
  let i = 0;
  while (i < actions.length) {
    const verb = verbOf(actions[i].call);
    let j = i + 1;
    while (
      j < actions.length &&
      verbOf(actions[j].call) === verb &&
      !isPlanUpdate(actions[j].call) &&
      !isPlanUpdate(actions[i].call) &&
      // A failure never folds away — it's the row a reader is looking for.
      actions[j].result?.data.ok !== false
    ) {
      j++;
    }
    if (j - i >= FOLD_AT) {
      out.push({ kind: "fold", verb, rows: actions.slice(i, j) });
    } else {
      for (let k = i; k < j; k++) out.push({ kind: "single", row: actions[k] });
    }
    i = j;
  }
  return out;
}

export function timeOf(event: Event): string {
  return new Date(event.ts).toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function durationOf(call: Event, result: Event | null): string | null {
  if (!result) return null;
  const ms = Date.parse(result.ts) - Date.parse(call.ts);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return fmtDuration(ms);
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms / 100)) / 10}s`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/** The instruction that started the run in flight, if one is. */
export function workingSince(turns: Turn[]): string | null {
  const live = turns.find((t) => t.live && !t.queued);
  return live?.instruction?.ts ?? null;
}

export function queuedCount(turns: Turn[]): number {
  return turns.filter((t) => t.queued).length;
}

/** The first instruction, for the sessions rail. */
export function firstInstruction(events: Event[]): string {
  const e = events.find((ev) => ev.kind === "user_instruction");
  return e ? String(e.data.text ?? "").replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

/** This viewer's own most recent instruction, for ↑ recall in the composer. */
export function lastInstructionBy(events: Event[], by: string | null): string | null {
  if (!by) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "user_instruction" && e.by === by) return String(e.data.text ?? "");
  }
  return null;
}
