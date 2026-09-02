import { ImageResponse } from "next/og";

// The link preview IS the product surface for something whose entire premise is
// "send someone the link" — a shared session that unfurls as a bare URL looks
// broken before anyone has clicked it. Generated rather than a static asset so
// it stays in the design tokens' actual colours instead of drifting from them.

export const alt = "Relay — watch an AI coding agent work, together, live";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#000000";
const SURFACE = "#0a0b0d";
const BORDER = "#1e2024";
const TEXT = "#f4f5f7";
const DIM = "#8c9098";
const ACCENT = "#4dd0c7";

// A miniature of the action ledger, which is the interface's signature surface.
// Showing it beats showing a logo: it says what the thing is at a glance.
const ROWS: [string, string, string][] = [
  ["read", "src/auth/session.ts", "142 lines"],
  ["edit", "src/auth/session.ts", "+18 −4"],
  ["bash", "pnpm test", "2 failed"],
  ["edit", "src/auth/token.ts", "+7 −1"],
  ["bash", "pnpm test", "24 passed"],
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: 64,
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: ACCENT,
                display: "flex",
              }}
            />
            <div style={{ fontSize: 30, color: TEXT, letterSpacing: 8 }}>relay</div>
          </div>

          <div
            style={{
              fontSize: 68,
              color: TEXT,
              marginTop: 36,
              lineHeight: 1.1,
              letterSpacing: -2,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Watch an agent work.</span>
            <span style={{ color: ACCENT }}>Together.</span>
          </div>

          <div style={{ fontSize: 27, color: DIM, marginTop: 26, display: "flex" }}>
            One live session, everyone with the link — and one person driving.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: "18px 24px",
          }}
        >
          {ROWS.map(([verb, target, detail], i) => (
            <div
              key={target + i}
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: 20,
                padding: "9px 0",
                borderTop: i === 0 ? "none" : `1px solid ${BORDER}`,
              }}
            >
              <span style={{ color: ACCENT, width: 74 }}>{verb}</span>
              <span style={{ color: TEXT, flex: 1 }}>{target}</span>
              <span style={{ color: DIM }}>{detail}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
