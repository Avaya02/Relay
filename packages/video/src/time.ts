import { Easing, interpolate, random } from "remotion";

export const FPS = 60;
export const WIDTH = 1280;
export const HEIGHT = 800;

export const sec = (t: number) => Math.round(t * FPS);

// The room's own --room-ease, so the video's UI moves the way the product does.
export const EASE_UI = Easing.bezier(0.22, 1, 0.36, 1);
// A camera dolly: a soft start and a long settle, never a snap at either end.
export const EASE_CAMERA = Easing.bezier(0.45, 0, 0.15, 1);
// A hand reaching for a target: quick to leave, slow to land.
export const EASE_REACH = Easing.bezier(0.35, 0.05, 0.1, 1);

// 0 → 1 across [start, start + dur], clamped either side.
export function prog(f: number, start: number, dur: number, easing = EASE_UI): number {
  if (dur <= 0) return f >= start ? 1 : 0;
  return interpolate(f, [start, start + dur], [0, 1], {
    easing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export const mix = (a: number, b: number, p: number) => a + (b - a) * p;

// When each character lands, in frames after the first: a typist's rhythm, with
// a little hesitation after spaces. Seeded, so every render types identically.
export function keystrokes(text: string, seed: string): number[] {
  const out: number[] = [];
  let ms = 0;
  for (let i = 0; i < text.length; i++) {
    out.push(sec(ms / 1000));
    const jitter = random(`${seed}-${i}`) * 34;
    ms += 42 + jitter + (text[i] === " " ? 46 : 0);
  }
  return out;
}

export function typedText(text: string, strokes: number[], f: number, start: number): string {
  let n = 0;
  while (n < strokes.length && start + strokes[n] <= f) n++;
  return text.slice(0, n);
}

export const typingFrames = (strokes: number[]) => (strokes.at(-1) ?? 0) + 1;

// A caret that holds solid while keys land and blinks once they stop, as macOS does.
export function caretOn(f: number, lastKey: number): boolean {
  const idle = f - lastKey;
  if (idle < sec(0.5)) return true;
  return Math.floor((idle - sec(0.5)) / sec(0.53)) % 2 === 1;
}
