import type { CursorPlan, Point } from "./Cursor";
import { sec } from "./time";
import { RUN_1, RUN_2, T } from "./script";

// Where each control sits on the desk, measured from a render (`pnpm measure`).
// Each point sits a little inside its control, where a hand would aim.
export const AT: Record<string, Point> = {
  cmd: { x: 432, y: 532 },
  link: { x: 300, y: 384 },
  aviComposer: { x: 300, y: 697 },
  aviInvite: { x: 812, y: 649 },
  aviGrant: { x: 563, y: 606 },
  himanshuAsk: { x: 1168, y: 651 },
  himanshuComposer: { x: 780, y: 698 },
};

// A press lands a beat after the pointer settles, as a person's does.
const reach = (to: Point, click: number, dur = 0.62) => ({ ...to, at: click - sec(dur + 0.1), dur: sec(dur) });

export const AVI_CURSOR: CursorPlan = {
  start: { x: 900, y: 690 },
  moves: [
    { ...AT.cmd, at: sec(0.3), dur: sec(0.75) },
    reach(AT.link, T.linkClick, 0.66),
    reach(AT.aviComposer, T.aviFocus),
    reach(AT.aviInvite, T.inviteClick),
    // Off the button once it's done: resting on Release reads as about to press it.
    { x: 560, y: 470, at: T.inviteClick + sec(0.45), dur: sec(0.9) },
    reach(AT.aviGrant, T.handOverClick, 0.7),
    // After the click the hand drifts off the button, as hands do.
    { x: AT.aviGrant.x - 40, y: AT.aviGrant.y - 70, at: T.handOverClick + sec(0.35), dur: sec(0.8) },
  ],
  clicks: [T.copyClick, T.linkClick, T.aviFocus, T.inviteClick, T.handOverClick],
  hidden: [
    [T.paste - sec(0.1), T.linkClick - sec(0.85)],
    [RUN_1.typeAt, T.inviteClick - sec(0.8)],
  ],
};

export const HIMANSHU_CURSOR: CursorPlan = {
  start: { x: 990, y: 380 },
  moves: [
    reach(AT.himanshuAsk, T.askClick, 0.8),
    reach(AT.himanshuComposer, T.himanshuFocus, 0.7),
  ],
  clicks: [T.askClick, T.himanshuFocus],
  hidden: [
    [0, T.himanshuJoins + sec(0.9)],
    [RUN_2.typeAt, Number.POSITIVE_INFINITY],
  ],
};

// Which control a hand is over: from when it lands until the press lets go.
export function hovered(clicks: [number, string][], f: number): string | null {
  for (const [click, id] of clicks) {
    if (f >= click - sec(0.12) && f < click + sec(0.3)) return id;
  }
  return null;
}

export function pressed(clicks: [number, string][], f: number): string | null {
  for (const [click, id] of clicks) {
    if (f >= click && f < click + sec(0.14)) return id;
  }
  return null;
}
