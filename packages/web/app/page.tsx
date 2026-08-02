"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSession } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setCreating(true);
    setError(null);
    try {
      const { id } = await createSession();
      router.push(`/session/${id}`);
    } catch {
      setError("Could not start a session — is the server running?");
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bg)] px-6 text-center">
      <h1 className="font-heading text-6xl font-medium tracking-tight text-[var(--text)]">
        relay
      </h1>
      <p className="max-w-md text-balance text-base leading-relaxed text-[var(--text-dim)]">
        Watch a live AI coding session with anyone who has the link — one
        person drives, everyone watches in real time.
      </p>
      <div className="flex flex-col items-center gap-3">
        <Button onClick={handleStart} disabled={creating} className="h-10 px-6 text-sm">
          {creating ? "Starting…" : "Start a session"}
        </Button>
        <p className="font-mono text-xs text-[var(--text-dim)]">
          No sign-up — just a name and a link.
        </p>
      </div>
      {error && (
        <p className="font-mono text-xs text-[var(--state-error)]">{error}</p>
      )}
      <LedgerPreview />
    </div>
  );
}

// A quiet, static preview of the action ledger — the same visual language
// as the real StreamView, so a first-time visitor sees what they're about
// to watch rather than taking the tagline's word for it.
function LedgerPreview() {
  return (
    <div
      aria-hidden
      className="mt-4 w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left"
    >
      <div className="flex items-baseline justify-between gap-4 border-l-2 border-[var(--border)] pl-3 font-mono text-xs text-[var(--text-dim)]">
        <span>
          <span className="text-[var(--text)]">▸ </span>edited src/App.tsx
        </span>
        <span className="shrink-0">12:04:02</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-4 border-l-2 border-[var(--border)] pl-3 font-mono text-xs text-[var(--text-dim)]">
        <span>
          <span className="text-[var(--text)]">✓ </span>ran npm test — 4 passed
        </span>
        <span className="shrink-0">12:04:09</span>
      </div>
    </div>
  );
}
