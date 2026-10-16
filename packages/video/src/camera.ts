import { EASE_CAMERA, HEIGHT, WIDTH, mix, prog, sec } from "./time";
import { RUN_1, RUN_2, T } from "./script";
import { AT } from "./cursors";

export type Rect = { x: number; y: number; w: number; h: number };

// Desk coordinates: the frame's own pixels at a zoom of 1. Windows fill the frame
// with one even margin, so a wide shot never floats a window in empty space.
const M = 20;
export const AVI_WIDE: Rect = { x: M, y: M, w: WIDTH - 2 * M, h: HEIGHT - 2 * M };
const HALF = (WIDTH - 3 * M) / 2;
export const AVI_HALF: Rect = { x: M, y: M, w: HALF, h: HEIGHT - 2 * M };
export const HIMANSHU_HALF: Rect = { x: 2 * M + HALF, y: M, w: HALF, h: HEIGHT - 2 * M };
export const TERM_WIN: Rect = { x: 150, y: 130, w: 980, h: 540 };

type View = { cx: number; cy: number; s: number };
// `dip` pulls the zoom back mid-move by that fraction, so a pan between two close
// shots arcs out and in instead of sliding flat across the gap.
type Shot = View & { at: number; dur: number; dip?: number };

export const FULL: View = { cx: WIDTH / 2, cy: HEIGHT / 2, s: 1 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// A close shot shows the inside of one window only: the centre is held back from
// the edges, so no window border or desk ever slides into a zoomed frame.
function inside(win: Rect, x: number, y: number, s: number): View {
  const hw = WIDTH / s / 2;
  const hh = HEIGHT / s / 2;
  return { cx: clamp(x, win.x + hw, win.x + win.w - hw), cy: clamp(y, win.y + hh, win.y + win.h - hh), s };
}

// The zoom at which a window's width fills the frame exactly, plus a hair.
const fillHalf = (WIDTH / AVI_HALF.w) * 1.02;
const dockOf = (win: Rect): View => inside(win, win.x + win.w / 2, win.y + win.h, fillHalf);

// Each shot is where the camera arrives and when it starts to travel there;
// dur 0 is a cut.
const SHOTS: Shot[] = [
  { at: 0, dur: 0, ...FULL },
  // A slow push in while the hand reaches for the command, centred on the hero
  // column rather than the command, so the margins either side stay even.
  { at: sec(0.2), dur: sec(1.4), ...inside(AVI_WIDE, AVI_WIDE.x + AVI_WIDE.w / 2, AT.cmd.y - 120, 1.4) },
  { at: T.termRaise, dur: sec(0.9), ...inside(TERM_WIN, TERM_WIN.x + 430, TERM_WIN.y + 270, 1.52) },
  { at: T.roomRaise, dur: sec(0.9), ...FULL },
  { at: T.aviFocus - sec(0.9), dur: sec(0.8), ...inside(AVI_WIDE, 504, AT.aviComposer.y - 120, 1.5) },
  { at: RUN_1.start + sec(0.3), dur: sec(0.9), ...FULL },
  // Close on each dock in turn: the ask on Himanshu's, then across to Avi's answer.
  { at: RUN_1.start + sec(RUN_1.finish) + sec(0.7), dur: sec(0.9), ...dockOf(HIMANSHU_HALF) },
  { at: T.askClick + sec(0.35), dur: sec(1.25), dip: 0.32, ...dockOf(AVI_HALF) },
  { at: T.handOver + sec(0.45), dur: sec(0.9), ...FULL },
  { at: T.himanshuFocus - sec(0.9), dur: sec(0.8), ...dockOf(HIMANSHU_HALF) },
  { at: RUN_2.start + sec(0.3), dur: sec(0.9), ...FULL },
];

// Starts from wherever the camera actually was, so a move that begins before the
// last one settles bends into it instead of jumping.
function along(i: number, f: number): View {
  const shot = SHOTS[i];
  if (i === 0) return shot;
  const from = along(i - 1, shot.at);
  const p = prog(f, shot.at, shot.dur, EASE_CAMERA);
  // Zoom moves in log space, so doubling reads the same at every scale.
  const dip = 1 - (shot.dip ?? 0) * Math.sin(Math.PI * p);
  const s = Math.exp(mix(Math.log(from.s), Math.log(shot.s), p)) * dip;
  return { cx: mix(from.cx, shot.cx, p), cy: mix(from.cy, shot.cy, p), s };
}

export function cameraAt(f: number): View {
  let i = 0;
  while (i + 1 < SHOTS.length && SHOTS[i + 1].at <= f) i++;
  return along(i, f);
}

export function cameraTransform({ cx, cy, s }: View): string {
  return `translate(${WIDTH / 2 - cx * s}px, ${HEIGHT / 2 - cy * s}px) scale(${s})`;
}
