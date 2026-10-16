"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// True once the timeline has advanced. Rows mounted before that are the first
// paint (and the server's markup), so they must not animate in.
export const PlayedCtx = createContext(false);

// Read once at mount: whether this element arrived after playback started.
export function useEnters(): boolean {
  const played = useContext(PlayedCtx);
  const [enters] = useState(played);
  return enters;
}

// Grows from zero height, so everything above glides up instead of jumping.
export function Enter({ children, className }: { children: ReactNode; className?: string }) {
  const enters = useEnters();
  return (
    <div className={className ? `droom-enter ${className}` : "droom-enter"} data-enter={enters || undefined}>
      <div>{children}</div>
    </div>
  );
}

export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="droom-reveal" data-open={open || undefined} aria-hidden={!open || undefined}>
      <div>{children}</div>
    </div>
  );
}

// Keeps the last live value while something closes, so it collapses with its
// content instead of emptying first.
export function useHeld<T>(value: T, live: boolean): T {
  const [held, setHeld] = useState(value);
  if (live && held !== value) setHeld(value);
  return live ? value : held;
}
