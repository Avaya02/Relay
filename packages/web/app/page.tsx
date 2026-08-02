import Link from "next/link";

// Phase 1 placeholder: POST /sessions + the real "start a session" flow are
// Phase 2. For now this just points at the one fixed bootstrap session
// (server-side: sessions.ts bootstrapDemoSession, id "demo") so two browser
// windows have somewhere to join.
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 text-center">
      <h1 className="text-2xl font-semibold text-[var(--text)]">relay</h1>
      <p className="max-w-sm text-sm text-[var(--text-dim)]">
        Live shared AI coding sessions. Landing + session creation land in
        Phase 2 — for now, join the one running demo session.
      </p>
      <Link
        href="/session/demo"
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--bg)]"
      >
        Join demo session
      </Link>
    </div>
  );
}
