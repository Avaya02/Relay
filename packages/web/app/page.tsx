"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DemoLedger } from "@/components/landing/DemoLedger";
import { RecentSessions } from "@/components/RecentSessions";
import { CommandBlock } from "@/components/landing/CommandBlock";

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
//
// The primary action is a command, not a button. Sessions are created by the
// CLI on the host's own machine — there is no "start" this page could honestly
// offer, because the page has no repository.

export default function Home() {
  const router = useRouter();
  const [joinId, setJoinId] = useState("");

  // Accepts a bare id or a pasted session URL — people will paste the whole
  // link, and rejecting that would be pedantry dressed as validation.
  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const raw = joinId.trim();
    if (!raw) return;
    const id = raw.includes("/") ? (raw.split("/").filter(Boolean).pop() ?? raw) : raw;
    router.push(`/session/${id}`);
  }

  // "Get started" scrolls to the command block — which, on most screens, is
  // already fully visible without scrolling. A plain anchor jump then moves
  // the page by a few imperceptible pixels and looks like a dead button.
  // Centering the target and flashing its border makes the click register
  // regardless of how far (or whether) the page actually moves.
  function handleGetStarted(e: React.MouseEvent) {
    e.preventDefault();
    const wrap = document.getElementById("start");
    if (!wrap) return;
    wrap.scrollIntoView({ behavior: "smooth", block: "center" });
    // The wrapper is the scroll target; the border being flashed belongs to
    // the .cmd box inside it, which is the thing that actually has one.
    const cmd = wrap.querySelector(".cmd");
    if (!cmd) return;
    cmd.classList.remove("cta-flash");
    void (cmd as HTMLElement).offsetWidth; // reflow, so the animation restarts on repeat clicks
    cmd.classList.add("cta-flash");
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
          <a href="#start" onClick={handleGetStarted} className="btn-solid landing-nav-cta">
            Get started
          </a>
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

            <div className="hero-cta" id="start">
              <CommandBlock command="npx relayrun" />
              <span className="hero-cta-note">
                Runs in your repo, on your machine. Prints a link to share.
              </span>
            </div>

            <form className="hero-join" onSubmit={handleJoin}>
              <label className="hero-join-label" htmlFor="join-id">
                Have a link?
              </label>
              <div className="hero-join-row">
                <input
                  id="join-id"
                  className="hero-join-input"
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  placeholder="Paste a session link or id"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button type="submit" className="btn-quiet" disabled={!joinId.trim()}>
                  Join
                </Button>
              </div>
            </form>

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

        <div className="hatch" aria-hidden />

        {/* Fold 3 — the trust argument. This is the whole reason the
            architecture is shaped the way it is, so it says so plainly rather
            than hiding in a spec row. */}
        <section className="lock" id="trust">
          <div className="lock-inner lock-grid">
            <div className="lock-head">
              <h2 className="section-title">Your code stays on your machine.</h2>
              <p className="lock-lede">
                The agent runs where the repository already is — your laptop,
                your checkout, your credentials. What crosses the network is a
                description of what happened, not the code it happened to.
              </p>
            </div>
            <dl className="lock-facts">
              <div>
                <dt>No upload, no clone on a server</dt>
                <dd>
                  Nothing to hand over before you can start, and nothing of
                  yours sitting on someone else&apos;s disk afterwards.
                </dd>
              </div>
              <div>
                <dt>The server is a relay, not a runtime</dt>
                <dd>
                  It orders events, enforces the lock, and fans out the
                  transcript. No repository, no shell, no API keys — ever.
                </dd>
              </div>
              <div>
                <dt>Any repository, no setup</dt>
                <dd>
                  Whichever directory you run the command in. No connected
                  accounts, no repo picker, no OAuth scope to grant.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <div className="hatch" aria-hidden />

        {/* Fold 4 — the sequence. Numbered because this genuinely IS an
            ordered process and the order carries information; numbering
            sections that aren't sequences is the reflex this avoids. */}
        <section className="how" id="how">
          <div className="how-inner">
            <h2 className="section-title">What happens when you send one</h2>
            <ol className="steps">
              <li className="step">
                <span className="step-n">01</span>
                <div className="step-body">
                  <h3 className="step-title">You start the agent</h3>
                  <p className="step-text">
                    <code>npx relayrun</code> in your repository. It works in
                    a disposable clone, connects out to the relay, and prints a
                    link. Nothing inbound, so no ports to open.
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
                    When a run finishes, the session&apos;s diff is real.
                    Publish commits it to a branch in your own repository —
                    ready to check out, already local.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* Fold 5 — the spec sheet. A datasheet rather than a grid of icon
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
                <dt>Topology</dt>
                <dd>
                  The agent runs on the host&apos;s machine and streams events
                  up over one WebSocket. The server coordinates; it never holds
                  code.
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
                  empties. The agent has full shell access inside it, with the
                  host&apos;s own permissions — the same trust as pairing.
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
          <h2 className="close-title">Run it. Send the link.</h2>
          <div className="close-cta">
            <CommandBlock command="npx relayrun" />
          </div>
        </section>

        <footer className="landing-foot">
          <span>relay</span>
          <span>Live agent sessions, shared.</span>
        </footer>
      </div>
    </div>
  );
}
