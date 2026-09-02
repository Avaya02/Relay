import type { Metadata } from "next";

// The session page itself is a client component, so it cannot export metadata.
// This layer exists only to give session links a name in the tab and a sane
// preview when one is pasted into a chat.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Session ${id}`,
    description:
      "A live Relay session — watch the agent work in real time, and ask for the wheel.",
    // A session link is a capability handed to specific people, the way a
    // video-call link is. Indexing one would publish an invitation that was
    // only ever sent to a few.
    robots: { index: false, follow: false },
    openGraph: {
      title: "Join a live Relay session",
      description:
        "Watch an AI coding agent work on a real repository, live. One person drives; anyone can ask for the wheel.",
    },
  };
}

export default function SessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
