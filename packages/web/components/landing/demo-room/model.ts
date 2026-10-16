// Scripted state for the landing's room demos. Steps use the agent's own verbs and
// one-line results (agent/summarize.ts), so a demo can't show a row the real
// summarizer never would.

export type Person = { id: string; name: string; hue: string };

export type DemoStep = {
  id: string;
  verb: string;
  target: string;
  // Absent while the tool is still running.
  result?: string;
  ok?: boolean;
  took?: string;
  // What a write streams while it runs; the landing's hero shows it, the room doesn't.
  code?: string[];
};

export type DemoTurn = {
  id: string;
  number: number;
  by: string;
  at: string;
  text: string;
  steps: DemoStep[];
  // Set when the run settles: the steps fold into a summary and the reply shows.
  settled?: { took: string; at: string; reply: string };
};

export type DemoPlan = {
  steps: { content: string; doing: string }[];
  done: number;
  // Whether steps[done] is in progress; false once all are done.
  active: boolean;
};

export type DemoSuggestion = { id: string; by: string; text: string };

export type DemoFrame = {
  driverId: string | null;
  working: boolean;
  // Seconds into the current run, for the status badge; derived from dwell times.
  elapsed: number;
  plan: DemoPlan | null;
  turns: DemoTurn[];
  suggestions: DemoSuggestion[];
  // Only the driver's screen shows a request, as in the protocol.
  asking: string | null;
  changes: number;
};

export type Op =
  | { prompt: Omit<DemoTurn, "steps" | "settled"> }
  | { promote: string; turn: Omit<DemoTurn, "steps" | "settled" | "by" | "text"> }
  | { step: DemoStep; turn: string }
  | { settle: string; turn: string; result: string; ok?: boolean; took?: string }
  | { finish: string; took: string; at: string; reply: string }
  | { plan: DemoPlan | null }
  | { suggest: DemoSuggestion }
  | { ask: string }
  | { handOver: string }
  | { changes: number };

// `dwell` is how long the frame this beat produces stays on screen.
export type Beat = { ops: Op[]; dwell: number };

function onTurn(turns: DemoTurn[], id: string, fn: (t: DemoTurn) => DemoTurn): DemoTurn[] {
  return turns.map((t) => (t.id === id ? fn(t) : t));
}

function apply(f: DemoFrame, op: Op): DemoFrame {
  if ("prompt" in op) {
    return { ...f, working: true, turns: [...f.turns, { ...op.prompt, steps: [] }] };
  }
  if ("promote" in op) {
    const s = f.suggestions.find((x) => x.id === op.promote);
    if (!s || !f.driverId) return f;
    // Sent by the driver, not the author: that's how the server records it.
    const turn: DemoTurn = { ...op.turn, by: f.driverId, text: s.text, steps: [] };
    return {
      ...f,
      working: true,
      suggestions: f.suggestions.filter((x) => x.id !== s.id),
      turns: [...f.turns, turn],
    };
  }
  if ("step" in op) {
    return { ...f, turns: onTurn(f.turns, op.turn, (t) => ({ ...t, steps: [...t.steps, op.step] })) };
  }
  if ("settle" in op) {
    const settled = { result: op.result, ok: op.ok ?? true, took: op.took };
    return {
      ...f,
      turns: onTurn(f.turns, op.turn, (t) => ({
        ...t,
        steps: t.steps.map((s) => (s.id === op.settle ? { ...s, ...settled } : s)),
      })),
    };
  }
  if ("finish" in op) {
    return {
      ...f,
      working: false,
      turns: onTurn(f.turns, op.finish, (t) => ({
        ...t,
        settled: { took: op.took, at: op.at, reply: op.reply },
      })),
    };
  }
  if ("plan" in op) return { ...f, plan: op.plan };
  if ("suggest" in op) return { ...f, suggestions: [...f.suggestions, op.suggest] };
  if ("ask" in op) return { ...f, asking: op.ask };
  if ("handOver" in op) return { ...f, driverId: op.handOver, asking: null };
  return { ...f, changes: op.changes };
}

export function framesOf(initial: DemoFrame, beats: Beat[]): DemoFrame[] {
  const frames: DemoFrame[] = [];
  let frame = initial;
  let runMs = initial.elapsed * 1000;
  for (const beat of beats) {
    frame = beat.ops.reduce(apply, frame);
    if (beat.ops.some((op) => "prompt" in op || "promote" in op)) runMs = 0;
    frame = { ...frame, elapsed: Math.floor(runMs / 1000) };
    frames.push(frame);
    if (frame.working) runMs += beat.dwell;
  }
  return frames;
}

export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
