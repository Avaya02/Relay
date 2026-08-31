"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DemoLedger } from "@/components/landing/DemoLedger";
import { createSession } from "@/lib/api";
import { RecentSessions } from "@/components/RecentSessions";

// The landing page, in the brand register: instrument faceplate. Structure is
// carried by hairline rules and a visible frame rather than cards and shadows,
// chrome is set in mono, and the only saturated colour on the page is the
// accent marking something live.
//
// Two things this page deliberately does NOT do, both of which the reference
// aesthetic would have suggested:
//
//   - No customer logo strip. Relay has no customers, and inventing social
//     proof is the one thing on a portfolio page that cannot survive a
//     follow-up question.
//   - No pricing / testimonials / waitlist nav. Borrowing a SaaS information
//     architecture would promise a product that isn't behind it.

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
      <div className="frame">
        <header className="landing-nav">
          <span className="landing-mark">relay</span>
          <nav className="landing-nav-links">
            <a className="landing-nav-link" href="#lock">
              What it is
            </a>
            <a className="landing-nav-link" href="#how">
              How it works
            </a>
            <a
              className="landing-nav-link"
              href="https://docs.claude.com/en/api/agent-sdk/overview"
              target="_blank"
              rel="noreferrer"
            >
              Agent SDK ↗
            </a>
          </nav>
          <Button
            onClick={handleStart}
            disabled={creating}
            className="btn-solid"
          >
            {creating ? "Starting…" : "Start a session"}
          </Button>
        </header>

        {/* Fold 1 — the claim, and the thing itself. */}
        <section className="hero">
          <div className="hero-copy">
            {/* The one eyebrow on the whole page. One as a deliberate system
                is voice; one above every section is scaffolding. */}
            <span className="badge badge--live hero-eyebrow">
              <span className="badge-dot" aria-hidden />
              Live multiplayer
            </span>
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
                className="btn-solid btn-lg"
              >
                {creating ? "Starting…" : "Start a session"}
              </Button>
              <span className="hero-cta-note">
                No sign-up — a name and a link.
              </span>
            </div>
            {error && <p className="hero-error">{error}</p>}
            {/* Renders nothing until this browser has actually been in one. */}
            <RecentSessions />
          </div>

          <div className="hero-demo">
            <DemoLedger />
            <p className="hero-demo-note">
              A recording of a real session — 13 tool calls against a live
              repository.
            </p>
          </div>
        </section>

        <div className="hatch" aria-hidden />

        {/* Fold 2 — the lock. The part nobody else has, so it gets the most
            room on the page. */}
        <section className="lock" id="lock">
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
                  A viewer asks, the driver grants. The lock moves; every screen
                  updates at once.
                </dd>
              </div>
              <div>
                <dt>Enforced on the server</dt>
                <dd>
                  Not a disabled button. An instruction from anyone who
                  isn&apos;t the driver is rejected before it reaches the agent.
                </dd>
              </div>
              <div>
                <dt>No input races, by construction</dt>
                <dd>
                  One writer means competing instructions can&apos;t interleave
                  — there is nothing to reconcile.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Fold 3 — the sequence. Numbered because this genuinely IS an
            ordered process and the order carries information; numbering
            sections that aren't sequences is the reflex this avoids. */}
        <section className="how" id="how">
          <div className="how-inner">
            <h2 className="section-title">What happens when you send one</h2>
            <ol className="steps">
              <li className="step">
                <span className="step-n">01</span>
                <div className="step-body">
                  <h3 className="step-title">The repo is cloned</h3>
                  <p className="step-text">
                    Each session gets a disposable <code>git clone</code>. The
                    agent&apos;s working directory is never your source
                    checkout, and it&apos;s deleted when the last person leaves.
                  </p>
                </div>
              </li>
              <li className="step">
                <span className="step-n">02</span>
                <div className="step-body">
                  <h3 className="step-title">The server stamps the order</h3>
                  <p className="step-text">
                    One counter, assigned in one function. Clients render in
                    that order and never sort — which is why two browsers agree
                    on what happened when.
                  </p>
                </div>
              </li>
              <li className="step">
                <span className="step-n">03</span>
                <div className="step-body">
                  <h3 className="step-title">Everyone sees it at once</h3>
                  <p className="step-text">
                    Every tool call, result and plan update is broadcast as it
                    happens. Join an hour in and you get the whole transcript
                    first, then the live stream.
                  </p>
                </div>
              </li>
              <li className="step">
                <span className="step-n">04</span>
                <div className="step-body">
                  <h3 className="step-title">The work becomes a branch</h3>
                  <p className="step-text">
                    When a run finishes, the session&apos;s diff is real. The
                    driver can commit it to a branch instead of watching it
                    evaporate with the tab.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* Fold 4 — the spec sheet. A datasheet rather than a grid of icon
            cards: denser, more honest, and not the pattern every generated
            landing page reaches for. */}
        <section className="spec">
          <div className="spec-inner">
            <h2 className="section-title">What&apos;s actually running</h2>
            <dl className="spec-sheet">
              <div className="spec-row">
                <dt>Engine</dt>
                <dd>
                  Claude Agent SDK — the same one Claude Code runs. Relay adds
                  the room around it, not a different model.
                </dd>
              </div>
              <div className="spec-row">
                <dt>Ordering</dt>
                <dd>
                  A server-assigned <code>seq</code> on every event, from a
                  single function. Clients only ever append.
                </dd>
              </div>
              <div className="spec-row">
                <dt>Isolation</dt>
                <dd>
                  A disposable clone per session, discarded when the room
                  empties.
                </dd>
              </div>
              <div className="spec-row">
                <dt>Catch-up</dt>
                <dd>
                  Full transcript replay on join, then the live stream — the
                  same path a dropped connection recovers through.
                </dd>
              </div>
              <div className="spec-row">
                <dt>Reconnect</dt>
                <dd>
                  A 30-second grace window holds your identity, so a wifi blip
                  doesn&apos;t take the wheel away.
                </dd>
              </div>
              <div className="spec-row">
                <dt>Persistence</dt>
                <dd>
                  An optional Postgres mirror of the transcript, so a dead link
                  renders a read-only replay instead of an error.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="close">
          <h2 className="close-title">Start one and send the link.</h2>
          <Button
            onClick={handleStart}
            disabled={creating}
            className="btn-solid btn-lg"
          >
            {creating ? "Starting…" : "Start a session"}
          </Button>
        </section>

        <footer className="landing-foot">
          <span>relay</span>
          <span>Live agent sessions, shared.</span>
        </footer>
      </div>
    </div>
  );
}
