import { EASE_REACH, mix, prog, sec } from "./time";

export type Point = { x: number; y: number };
// Arrives at (x, y) `dur` frames after `at`.
export type Move = Point & { at: number; dur: number };
export type CursorPlan = {
  start: Point;
  moves: Move[];
  clicks: number[];
  // [from, to): macOS hides the pointer once its owner starts typing.
  hidden: [number, number][];
};

function along(plan: CursorPlan, i: number, f: number): Point {
  if (i < 0) return plan.start;
  const move = plan.moves[i];
  const from = along(plan, i - 1, move.at);
  const p = prog(f, move.at, move.dur, EASE_REACH);
  // A hand never travels a ruler line: bow the path a little, always the same way.
  const dx = move.x - from.x;
  const dy = move.y - from.y;
  const bow = 0.12;
  const cx = (from.x + move.x) / 2 - dy * bow;
  const cy = (from.y + move.y) / 2 + dx * bow;
  return {
    x: mix(mix(from.x, cx, p), mix(cx, move.x, p), p),
    y: mix(mix(from.y, cy, p), mix(cy, move.y, p), p),
  };
}

export function cursorAt(plan: CursorPlan, f: number): Point {
  let i = -1;
  while (i + 1 < plan.moves.length && plan.moves[i + 1].at <= f) i++;
  return along(plan, i, f);
}

// A press is quick and the release softer, like a trackpad click.
function pressDepth(plan: CursorPlan, f: number): number {
  let depth = 0;
  for (const c of plan.clicks) {
    const t = f - c;
    if (t < 0 || t > sec(0.22)) continue;
    depth = Math.max(depth, t < sec(0.05) ? t / sec(0.05) : 1 - (t - sec(0.05)) / sec(0.17));
  }
  return depth;
}

function visibility(plan: CursorPlan, f: number): number {
  let v = 1;
  for (const [from, to] of plan.hidden) {
    const fadeOut = 1 - prog(f, from, sec(0.12));
    const fadeIn = Number.isFinite(to) ? prog(f, to, sec(0.16)) : 0;
    if (f >= from) v = Math.min(v, Math.max(fadeOut, fadeIn));
  }
  return v;
}

export function Cursor({ plan, f }: { plan: CursorPlan; f: number }) {
  const { x, y } = cursorAt(plan, f);
  const opacity = visibility(plan, f);
  if (opacity <= 0) return null;
  const scale = 1 - 0.14 * pressDepth(plan, f);
  return (
    <svg
      className="cursor"
      width="17"
      height="24"
      viewBox="0 0 17 24"
      style={{ opacity, transform: `translate(${x - 1.5}px, ${y - 1.5}px) scale(${scale})` }}
    >
      <path
        d="M1.5 1.5v17.6l4.3-4.1 2.9 6.7 3-1.3-2.9-6.6h6z"
        fill="#0a0a0a"
        stroke="#fafafa"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
