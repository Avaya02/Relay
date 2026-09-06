import { ImageResponse } from "next/og";

// The nav's .landing-mark-tile at favicon scale, so the tab and the header
// carry the same mark rather than two unrelated ones.
//
// Satori resolves no CSS custom properties, so these are copied from
// app/styles/tokens.css by hand and carry the same drift caveat as
// opengraph-image.tsx.
const TILE = "#fafafa"; // --text
const GLYPH = "#0a0a0a"; // --bg

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: TILE,
          color: GLYPH,
          // Matches --radius: 0. The square edge is what makes it legible at
          // 16px — a rounded tile loses its silhouette to antialiasing there.
          borderRadius: 0,
          // Sized to nearly fill the tile. The default here looked correct in
          // isolation and vanished at 16px — a favicon glyph has to crowd its
          // container far more than the same letter would in a nav.
          fontSize: 30,
          fontWeight: 700,
          // The cap sits high in the em box, so equal padding leaves the letter
          // looking low in a square this small.
          lineHeight: 1,
          paddingBottom: 3,
        }}
      >
        R
      </div>
    ),
    { ...size },
  );
}
