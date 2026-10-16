import { mix, prog, sec } from "../time";
import { AVI, HIMANSHU, RUN_1, RUN_2, T, type Person, type Run } from "../script";

export const RUNS = [RUN_1, RUN_2];

// Every value here is a pure function of the frame, so any frame renders alone.

export const driverAt = (f: number): Person => (f >= T.handOver ? HIMANSHU : AVI);
export const present = (f: number): Person[] => (f >= T.himanshuJoins ? [AVI, HIMANSHU] : [AVI]);
export const asking = (f: number): boolean => f >= T.requestShows && f < T.handOver;

export const sentAt = (run: Run) => run.start;
export const finishAt = (run: Run) => run.start + sec(run.finish);
export const stepAt = (run: Run, t: number) => run.start + sec(t);

export type Status = { kind: "idle" | "working" | "done"; clock: string | null };

export function statusAt(f: number): Status {
  const run = [...RUNS].reverse().find((r) => f >= sentAt(r));
  if (!run) return { kind: "idle", clock: null };
  if (f >= finishAt(run)) return { kind: "done", clock: null };
  // The badge counts the agent's time, not the edit's: the film runs faster than the run.
  const seconds = Math.floor(((f - sentAt(run)) / (finishAt(run) - sentAt(run))) * run.runSeconds);
  return { kind: "working", clock: `0:${String(seconds).padStart(2, "0")}` };
}

// The Changes count: files an edit has landed in so far.
export function changedFiles(f: number): number {
  const files = new Set<string>();
  for (const run of RUNS) {
    for (const step of run.steps) {
      if (step.verb !== "read" && step.verb !== "ran" && f >= stepAt(run, step.done)) files.add(step.target);
    }
  }
  return files.size;
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export function mixHex(a: string, b: string, p: number): string {
  const to = channels(b);
  return `rgb(${channels(a).map((c, i) => Math.round(mix(c, to[i], p))).join(", ")})`;
}

// A handover recolours the room over the room's own 700ms.
export const driverColour = (f: number) => mixHex(AVI.hue, HIMANSHU.hue, prog(f, T.handOver, sec(0.7)));
