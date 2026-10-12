import type { Metadata } from "next";
import { DM_Mono, Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Same family as body but a distinct token, so the display face can change
// without touching call sites; no extra download since Geist is already loaded.
const geistDisplay = Geist({
  variable: "--font-display",
  subsets: ["latin"],
});

// Wordmark only: five characters on two surfaces, so one weight and subset.
// 400, not 500: reversed type looks heavier than it measures.
const dmMono = DM_Mono({
  variable: "--font-wordmark",
  weight: "400",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Everyone with the link watches the same AI coding session, live. One person drives — and can hand over the wheel mid-task.";

// og:image needs absolute URLs. NEXT_PUBLIC_SITE_URL wins over VERCEL_URL so a
// custom domain isn't replaced by the deployment hostname.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Relay — watch an AI agent work, together",
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
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
