import type { CSSProperties, ReactNode } from "react";

// Frame-driven twins of the landing demo's Enter and Reveal: Remotion renders
// frames out of order, so nothing may rely on a CSS transition having run.

// Grows from no height, so rows above glide up rather than jump. `p` is 0 → 1.
export function Grow({ p, rise = 6, children }: { p: number; rise?: number; children: ReactNode }) {
  if (p <= 0) return null;
  return (
    <div className="droom-enter" style={{ gridTemplateRows: `${p}fr` }}>
      <div style={p < 1 ? { overflow: "hidden" } : undefined}>
        <div style={p < 1 ? { opacity: p, transform: `translateY(${(1 - p) * rise}px)` } : undefined}>
          {children}
        </div>
      </div>
    </div>
  );
}

// Closes to no height as `p` falls to 0, the way the room's disclosures fold.
export function Fold({ p, children }: { p: number; children: ReactNode }) {
  if (p <= 0) return null;
  const style: CSSProperties = { gridTemplateRows: `${p}fr`, opacity: p };
  return (
    <div className="droom-enter" style={style}>
      <div style={p < 1 ? { overflow: "hidden" } : undefined}>{children}</div>
    </div>
  );
}

// The room's 1.6s breathe on live dots, read from the frame.
export function breathe(f: number, fps: number): number {
  const t = (f / fps) % 1.6;
  return 0.7 + 0.3 * Math.cos((t / 1.6) * Math.PI * 2);
}
