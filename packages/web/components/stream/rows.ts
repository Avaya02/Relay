import type { Event, ToolDetail } from "@relay/shared";

export type ActionRow = {
  type: "action";
  call: Event;
  result: Event | null;
};

export type Row =
  | { type: "text"; event: Event }
  | ActionRow
  | { type: "done"; event: Event }
  | { type: "error"; event: Event }
  | { type: "stopped"; event: Event };

export type Turn = {
  key: string;
  // Null for a replay that opens mid-run, before any instruction.
  instruction: Event | null;
  number: number;
  rows: Row[];
  // No terminal row yet.
  live: boolean;
  // Accepted by the server but waiting behind a run in flight.
  queued: boolean;
};

// An unmatched result (a history replay cut mid-action) gets its own row rather than vanishing.
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
      case "agent_stopped":
        rows.push({ type: "stopped", event });
        break;
    }
  }
  return rows;
}

// The server logs `user_instruction` on accept even mid-run, so it becomes a
// queued turn; later rows still belong to the earlier run until it settles.
export function groupTurns(events: Event[]): Turn[] {
  const turns: Turn[] = [];
  let number = 0;

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
      const next = turns.find((t) => t.queued);
      if (next) {
        next.queued = false;
        target = next;
      } else {
        // A replay opened mid-run: these rows belong to a turn whose prompt is off-screen.
        target = { key: "t0", instruction: null, number: 0, rows: [], live: true, queued: false };
        turns.push(target);
      }
    }

    target.rows.push(row);
    if (row.type === "done" || row.type === "error" || row.type === "stopped") {
      target.live = false;
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

// Runs of the same verb at least this long fold into one entry.
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
      // Failures never fold away.
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

export type TraceEntry = StepEntry | { kind: "note"; event: Event };

// While live every message stays in the trace: which one is the reply isn't
// known until the run settles.
export function splitTurn(turn: Turn, live: boolean): { trace: TraceEntry[]; reply: Event[] } {
  const actions = actionsOf(turn);
  const lastActionSeq = actions.length ? actions[actions.length - 1].call.seq : -1;
  const trace: TraceEntry[] = [];
  const reply: Event[] = [];
  let run: ActionRow[] = [];
  const flush = () => {
    trace.push(...foldSteps(run));
    run = [];
  };
  for (const row of turn.rows) {
    if (row.type === "action") {
      run.push(row);
    } else if (row.type === "text") {
      if (!live && row.event.seq >= lastActionSeq) {
        reply.push(row.event);
      } else {
        flush();
        trace.push({ kind: "note", event: row.event });
      }
    }
  }
  flush();
  return { trace, reply };
}

const PRESENT: Record<string, string> = {
  read: "Reading",
  wrote: "Writing",
  edited: "Editing",
  ran: "Running",
  grepped: "Searching",
  globbed: "Searching",
  searched: "Searching",
  fetched: "Fetching",
  delegated: "Delegating",
};

export function activeLabel(actions: ActionRow[]): string {
  const pending = [...actions].reverse().find((a) => !a.result);
  if (!pending) return "Thinking";
  if (isPlanUpdate(pending.call)) return "Updating the plan";
  const verb = PRESENT[verbOf(pending.call)] ?? "Working on";
  const target = String(pending.call.data.target ?? "");
  return target ? `${verb} ${target}` : verb;
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

export function workingSince(turns: Turn[]): string | null {
  const live = turns.find((t) => t.live && !t.queued);
  return live?.instruction?.ts ?? null;
}

export function queuedCount(turns: Turn[]): number {
  return turns.filter((t) => t.queued).length;
}

export function firstInstruction(events: Event[]): string {
  const e = events.find((ev) => ev.kind === "user_instruction");
  return e ? String(e.data.text ?? "").replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

export function lastInstructionBy(events: Event[], by: string | null): string | null {
  if (!by) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "user_instruction" && e.by === by) return String(e.data.text ?? "");
  }
  return null;
}
