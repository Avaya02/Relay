import type { Metadata } from "next";
import { DM_Mono, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Load-bearing, not stylistic: the ledger, timestamps, and diffs all live in
// this face, and it's what makes the agent's actions read as a machine record
// rather than as prose (RELAY_BUILD_SPEC.md §7 names it explicitly).
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display resolves to the same family as body, which is the reference's own
// system: the contrast axis is sans-against-mono, not sans-against-sans. Kept
// as a distinct token so the display face can change later without touching
// every call site — and because Geist is already loaded for body, this costs
// no extra download. It replaced Archivo, so the redesign is one font lighter.
const geistDisplay = Geist({
  variable: "--font-display",
  subsets: ["latin"],
});

// The wordmark, and nothing else. Geist is deliberately characterless — that is
// what makes it a good UI face and a poor brand: set in it, "relay" reads as a
// label rather than a name. A mono carries the CLI-first premise, and this one
// has letterforms with enough personality to stand without a symbol beside it.
//
// One weight, one subset: it renders five characters on two surfaces, so
// anything more is download nobody sees.
// 400, not 500: reversed type looks heavier than it measures, so the weight
// that reads as light on a white page reads as chunky on this one.
const dmMono = DM_Mono({
  variable: "--font-wordmark",
  weight: "400",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Everyone with the link watches the same AI coding session, live. One person drives — and can hand over the wheel mid-task.";

// Absolute URLs are required for og:image, and Next can only build them from a
// base it is told. Vercel injects VERCEL_URL; NEXT_PUBLIC_SITE_URL wins so a
// custom domain doesn't advertise the deployment hostname instead.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Relay — watch an AI agent work, together",
    // Session pages set only their own name; this keeps the product on the tab
    // without every page having to remember to append it.
    template: "%s · Relay",
  },
  description: DESCRIPTION,
  applicationName: "Relay",
  openGraph: {
    type: "website",
    siteName: "Relay",
    title: "Watch an AI agent work. Together.",
    description: DESCRIPTION,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Watch an AI agent work. Together.",
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${geistDisplay.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
