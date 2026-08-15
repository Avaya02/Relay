"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DemoLedger } from "@/components/landing/DemoLedger";
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
    <div className="landing">
      <header className="landing-nav">
        <span className="landing-mark">relay</span>
        <a
          className="landing-nav-link"
          href="https://github.com/anthropics/claude-agent-sdk-typescript"
          target="_blank"
          rel="noreferrer"
        >
          built on the Claude Agent SDK ↗
        </a>
      </header>

      <main>
        {/* Fold 1 — the claim, and the thing itself. */}
        <section className="hero">
          <div className="hero-copy">
            <h1 className="hero-title">
              Watch an agent work.
              <br />
              <em>Together.</em>
            </h1>
            <p className="hero-sub">
              Everyone with the link watches the same coding session, live, in
              the same moment. One person drives — and can hand over the wheel
              mid-task.
            </p>
            <div className="hero-cta">
              <Button
                onClick={handleStart}
                disabled={creating}
                className="h-11 px-6 text-sm"
              >
                {creating ? "Starting…" : "Start a session"}
              </Button>
              <span className="hero-cta-note">
                No sign-up — a name and a link.
              </span>
            </div>
            {error && <p className="hero-error">{error}</p>}
          </div>

          <div className="hero-demo">
            <DemoLedger />
            <p className="hero-demo-note">
              A recording of a real session — 13 tool calls against a live
              repository.
            </p>
          </div>
        </section>

        {/* Fold 2 — the lock. The part nobody else has. */}
        <section className="lock">
          <div className="lock-inner lock-grid">
            <div className="lock-head">
              <h2 className="section-title">One writer. Never two.</h2>
              <p className="lock-lede">
                Screen-sharing an agent gets you an audience. Relay gets you a
                relay: exactly one person holds the wheel, the server enforces
                it, and control passes cleanly when someone else should take
                over.
              </p>
            </div>
            <dl className="lock-facts">
                <div>
                  <dt>Request → hand over → release</dt>
                  <dd>
                    A viewer asks, the driver grants. The lock moves; every
                    screen updates at once.
                  </dd>
                </div>
                <div>
                  <dt>Enforced on the server</dt>
                  <dd>
                    Not a disabled button. An instruction from anyone who
                    isn&apos;t the driver is rejected before it reaches the
                    agent.
                  </dd>
                </div>
                <div>
                  <dt>No input races, by construction</dt>
                  <dd>
                    One writer means competing instructions can&apos;t
                    interleave — there is nothing to reconcile.
                  </dd>
                </div>
            </dl>
          </div>
        </section>

        {/* Fold 3 — how it holds up. Credibility, stated plainly. */}
        <section className="how">
          <div className="how-inner">
            <h2 className="section-title">What&apos;s actually running</h2>
            <ul className="how-list">
              <li>
                <span className="how-k">The agent</span>
                <span className="how-v">
                  The Claude Agent SDK — the same engine Claude Code runs. Relay
                  adds the room around it, not a different model.
                </span>
              </li>
              <li>
                <span className="how-k">The repo</span>
                <span className="how-v">
                  A disposable per-session clone. The agent&apos;s working
                  directory is never your source checkout, and it&apos;s deleted
                  when the last person leaves.
                </span>
              </li>
              <li>
                <span className="how-k">The ordering</span>
                <span className="how-v">
                  One server-owned counter stamps every event. Clients render in
                  that order and never trust their own clock — which is why two
                  screens agree.
                </span>
              </li>
              <li>
                <span className="how-k">Catching up</span>
                <span className="how-v">
                  Join an hour in and you get the whole transcript first, then
                  the live stream. Same path a dropped connection recovers
                  through.
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="close">
          <h2 className="close-title">Start one and send the link.</h2>
          <Button
            onClick={handleStart}
            disabled={creating}
            className="h-11 px-6 text-sm"
          >
            {creating ? "Starting…" : "Start a session"}
          </Button>
        </section>
      </main>

      <footer className="landing-foot">
        <span>relay</span>
        <span>Live agent sessions, shared.</span>
      </footer>
    </div>
  );
}
