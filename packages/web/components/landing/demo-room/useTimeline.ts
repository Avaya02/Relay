"use client";

import { useEffect, useRef, useState } from "react";
import { useMedia } from "@/lib/useMedia";

// Long enough to read as a deliberate dip, short enough not to look stalled.
const DIP_MS = 320;

// "out" fades the room, "in" swaps to the first beat with transitions off and
// fades back, so the rewind can't read as the wheel being handed back.
export type Phase = "play" | "out" | "in";

export function useTimeline(dwells: number[], start: number) {
  const reduce = useMedia("(prefers-reduced-motion: reduce)");
  const rootRef = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(start);
  const [inView, setInView] = useState(false);
  // Null follows the motion preference until the visitor presses the button.
  const [paused, setPaused] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("play");
  const [played, setPlayed] = useState(false);
  const stopped = paused ?? reduce;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false), {
      threshold: 0.3,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    // A dip finishes even when paused, or the room would stay faded out.
    if (phase === "out") {
      const t = setTimeout(() => {
        setIndex(0);
        setPhase("in");
      }, DIP_MS);
      return () => clearTimeout(t);
    }
    if (phase === "in") {
      const t = setTimeout(() => setPhase("play"), DIP_MS);
      return () => clearTimeout(t);
    }
    if (stopped) return;
    const t = setTimeout(() => {
      setPlayed(true);
      if (index >= dwells.length - 1) setPhase("out");
      else setIndex(index + 1);
    }, dwells[index]);
    return () => clearTimeout(t);
  }, [inView, stopped, phase, index, dwells]);

  return {
    rootRef,
    index,
    phase,
    played,
    paused: stopped,
    toggle: () => setPaused(!stopped),
  };
}
