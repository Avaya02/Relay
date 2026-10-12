import type { Metadata } from "next";

// The page is a client component and can't export metadata, hence this layer.
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
    // The link is the capability; indexing it would publish the invitation.
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
