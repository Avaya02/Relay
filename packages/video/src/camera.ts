import { EASE_CAMERA, HEIGHT, WIDTH, mix, prog, sec } from "./time";
import { RUN_1, RUN_2, T } from "./script";

// Desk coordinates: the windows' own CSS pixels at a zoom of 1.
export const DESK = { w: 1320, h: 720 };
export const AVI_WIN = { x: 0, y: 0, w: 640, h: 720 };
export const HIMANSHU_WIN = { x: 680, y: 0, w: 640, h: 720 };
// Inside Avi's browser, so the browser covers it whole when the link opens.
export const TERM_WIN = { x: 6, y: 172, w: 628, h: 400 };

type Shot = { at: number; dur: number; cx: number; cy: number; s: number };

export const OVERVIEW = { cx: DESK.w / 2, cy: DESK.h / 2, s: 0.92 };

// Each shot is where the camera arrives, and when it starts to travel there.
const SHOTS: Shot[] = [
  // The whole window first, so it reads as relayrun.in in a browser.
  { at: 0, dur: 0, cx: 320, cy: 350, s: 1.12 },
  // Then a slow push in while the hand reaches for the command.
  { at: sec(0.15), dur: sec(1.5), cx: 190, cy: 380, s: 1.85 },
  { at: T.termRaise - sec(0.05), dur: sec(1.05), cx: 320, cy: 372, s: 1.72 },
  { at: T.roomRaise + sec(0.05), dur: sec(1.1), cx: 320, cy: 360, s: 1.07 },
  // Himanshu opens the link: pull back so both screens share the frame.
  { at: T.himanshuJoins - sec(0.35), dur: sec(1.2), ...OVERVIEW },
  // Close on each dock in turn: the ask on Himanshu's, the answer on Avi's.
  { at: RUN_1.start + sec(RUN_1.finish) + sec(0.75), dur: sec(1.05), cx: 1000, cy: 600, s: 1.9 },
  { at: T.requestShows - sec(0.2), dur: sec(0.95), cx: 320, cy: 600, s: 1.9 },
  { at: T.handOver + sec(0.4), dur: sec(1.0), ...OVERVIEW },
  { at: T.himanshuFocus - sec(0.95), dur: sec(0.95), cx: 1000, cy: 430, s: 1.2 },
  { at: RUN_2.start + sec(0.35), dur: sec(1.1), ...OVERVIEW },
  // The settle: a breath of push-in while both windows land on the answer.
  { at: RUN_2.start + sec(RUN_2.finish), dur: sec(3.2), cx: DESK.w / 2, cy: DESK.h / 2 + 6, s: 0.96 },
];

export type Camera = { cx: number; cy: number; s: number };

// Starts from wherever the camera actually was, so a move that begins before the
// last one settles bends into it instead of jumping.
function along(i: number, f: number): Camera {
  const shot = SHOTS[i];
  if (i === 0) return shot;
  const from = along(i - 1, shot.at);
  const p = prog(f, shot.at, shot.dur, EASE_CAMERA);
  // Zoom moves in log space, so doubling reads the same at every scale.
  const s = Math.exp(mix(Math.log(from.s), Math.log(shot.s), p));
  return { cx: mix(from.cx, shot.cx, p), cy: mix(from.cy, shot.cy, p), s };
}

export function cameraAt(f: number): Camera {
  let i = 0;
  while (i + 1 < SHOTS.length && SHOTS[i + 1].at <= f) i++;
  return along(i, f);
}

export function cameraTransform({ cx, cy, s }: Camera): string {
  return `translate(${WIDTH / 2 - cx * s}px, ${HEIGHT / 2 - cy * s}px) scale(${s})`;
}
