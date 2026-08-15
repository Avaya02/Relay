import type { Metadata } from "next";
import { Archivo, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Load-bearing, not stylistic: the ledger, timestamps, and diffs all live in
// this face, and it's what makes the agent's actions read as a machine record
// rather than as prose (RELAY_BUILD_SPEC.md §7 names it explicitly).
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for "big and rare" moments only (landing hero, session title)
// — RELAY_BUILD_SPEC.md §7 asks for "a characterful grotesque with
// personality" and names Space Grotesk as an *example*. Archivo satisfies the
// direction from a different starting point: it descends from grotesques cut
// for print signage and wayfinding, which is the right physical reference for
// an instrument (a cockpit placard, not a startup wordmark). Space Grotesk is
// also, by now, one of the most over-reached-for display faces in generated
// design work — avoiding it is the point, not a deviation from the spec.
const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Relay",
  description: "Watch a live AI coding session, together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${jetbrainsMono.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
