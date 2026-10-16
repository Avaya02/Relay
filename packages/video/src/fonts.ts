import { loadFont as loadDmMono } from "@remotion/google-fonts/DMMono";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";

const sans = loadGeist("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] }).fontFamily;
const mono = loadGeistMono("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;
const mark = loadDmMono("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;

// next/font's variable names, on :root as next/font puts them: the web app's
// theme resolves --font-sans from these there, so a nearer element is too late.
export const FONT_ROOT = `:root {
  --font-geist-sans: "${sans}", ui-sans-serif, system-ui, sans-serif;
  --font-geist-mono: "${mono}", ui-monospace, monospace;
  --font-display: "${sans}", ui-sans-serif, system-ui, sans-serif;
  --font-wordmark: "${mark}", ui-monospace, monospace;
}`;
