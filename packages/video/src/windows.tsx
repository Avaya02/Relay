import type { CSSProperties, ReactNode } from "react";

type Rect = { x: number; y: number; w: number; h: number };

function frame(rect: Rect, style?: CSSProperties): CSSProperties {
  return { left: rect.x, top: rect.y, width: rect.w, height: rect.h, ...style };
}

// Neutral lights: whose screen it is reads from the label, not from colour.
function Lights() {
  return (
    <span className="win-lights">
      <i />
      <i />
      <i />
    </span>
  );
}

export function BrowserWindow({
  rect,
  url,
  owner,
  style,
  children,
}: {
  rect: Rect;
  url: string;
  owner: { name: string; hue: string };
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className="win" style={frame(rect, style)}>
      <div className="win-chrome">
        <Lights />
        <span className="win-url">{url}</span>
        <span className="win-owner" style={{ "--hue": owner.hue } as CSSProperties}>
          {owner.name}
        </span>
      </div>
      <div className="win-body">{children}</div>
    </div>
  );
}

export function TerminalWindow({
  rect,
  title,
  style,
  children,
}: {
  rect: Rect;
  title: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className="win win--term" style={frame(rect, style)}>
      <div className="win-chrome">
        <Lights />
        <span className="win-title">{title}</span>
      </div>
      <div className="term">{children}</div>
    </div>
  );
}
