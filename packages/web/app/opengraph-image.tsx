import { ImageResponse } from "next/og";

// The link preview IS the product surface for something whose entire premise is
// "send someone the link" — a shared session that unfurls as a bare URL looks
// broken before anyone has clicked it.
//
// Satori resolves no CSS custom properties, so these values are copied from
// app/styles/tokens.css by hand and WILL drift unless a token change updates
// them here too. --border is an alpha token there; this is its composited
// value over --bg.

export const alt = "Relay — watch an AI coding agent work, together, live";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0a0a0a";
const SURFACE = "#121212";
const BORDER = "#262626";
const TEXT = "#fafafa";
const DIM = "#a3a3a3";

// A miniature of the action ledger, which is the interface's signature surface.
// Showing it beats showing a logo: it says what the thing is at a glance.
const ROWS: [string, string, string][] = [
  ["read", "src/auth/session.ts", "142 lines"],
  ["edit", "src/auth/session.ts", "+18 −4"],
  ["bash", "pnpm test", "2 failed"],
  ["edit", "src/auth/token.ts", "+7 −1"],
  ["bash", "pnpm test", "24 passed"],
];

// Satori cannot read woff2, and an old UA is what makes Google Fonts serve the
// TTF it can. Fetched at build time (this route is prerendered), and failure is
// non-fatal: a preview in the fallback face beats a build that cannot ship.
//
// Both faces are loaded because supplying `fonts` at all REPLACES Satori's
// default set — registering only the wordmark silently dropped the headline to
// monospace and collapsed the sans-against-mono contrast the design rests on.
async function googleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`,
      { headers: { "User-Agent": "Mozilla/4.0" } },
    ).then((r) => r.text());
    const url = css.match(/https:\/\/[^)]+\.ttf/)?.[0];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Image() {
  const [wordmark, display, mono] = await Promise.all([
    googleFont("DM+Mono", 500),
    googleFont("Geist", 400),
    googleFont("Geist+Mono", 400),
  ]);
  const fonts = [
    wordmark && { name: "Wordmark", data: wordmark, style: "normal" as const, weight: 500 as const },
    display && { name: "Display", data: display, style: "normal" as const, weight: 400 as const },
    mono && { name: "Mono", data: mono, style: "normal" as const, weight: 400 as const },
  ].filter((f) => f !== null);

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
          fontFamily: "Display, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* The wordmark alone, as in the nav — no tile. A symbol beside a
              word that already starts with the same letter said it twice. */}
          <div
            style={{
              display: "flex",
              fontFamily: "Wordmark, monospace",
              fontSize: 34,
              color: TEXT,
              letterSpacing: -1,
            }}
          >
            relay
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
            <span>Together.</span>
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
            // Data, so mono — the same rule the real ledger follows.
            fontFamily: "Mono, monospace",
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
              <span style={{ color: DIM, width: 74 }}>{verb}</span>
              <span style={{ color: TEXT, flex: 1 }}>{target}</span>
              <span style={{ color: DIM }}>{detail}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      // Omitted entirely when both fetches failed, so Satori keeps its defaults
      // rather than being handed an empty set.
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );
}
