"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HeroLab } from "@/components/landing/hero-lab/HeroLab";
import { RecentSessions } from "@/components/RecentSessions";
import { CommandBlock } from "@/components/landing/CommandBlock";
import Image from "next/image";
import { ContactDialog } from "@/components/landing/ContactDialog";
import { ProductTour } from "@/components/landing/ProductTour";
import { TopologyDiagram } from "@/components/landing/TopologyDiagram";

// Chrome is achromatic; colour marks live state in the session panels only.
// The primary action is a command: sessions are created by the CLI, not this page.
export default function Home() {
  const router = useRouter();
  const [joinId, setJoinId] = useState("");

  // Accepts a bare id or a pasted session URL.
  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const raw = joinId.trim();
    if (!raw) return;
    const id = raw.includes("/") ? (raw.split("/").filter(Boolean).pop() ?? raw) : raw;
    router.push(`/session/${id}`);
  }

  // The command block is usually already visible, so a plain anchor jump looks
  // like a dead button; centering and flashing it makes the click register.
  function handleGetStarted(e: React.MouseEvent) {
    e.preventDefault();
    const wrap = document.getElementById("start");
    if (!wrap) return;
    wrap.scrollIntoView({ behavior: "smooth", block: "center" });
    // The wrapper scrolls; the .cmd inside it owns the border that flashes.
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
            <a className="landing-nav-link" href="#tour">
              How it works
            </a>
            <a
              className="landing-nav-link"
              href="https://code.claude.com/docs/en/agent-sdk/overview"
              target="_blank"
              rel="noreferrer"
            >
              Agent SDK ↗
            </a>
          </nav>
          <div className="landing-nav-actions">
            <a
              className="btn-quiet landing-nav-gh"
              href="https://github.com/Avaya02/Relay"
              target="_blank"
              rel="noreferrer"
              aria-label="Relay on GitHub"
            >
              <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden>
                <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
              </svg>
              <span className="landing-nav-gh-label">GitHub</span>
            </a>
            <a href="#start" onClick={handleGetStarted} className="btn-solid landing-nav-cta">
              Get started
            </a>
          </div>
        </header>

        <div className="hatch" aria-hidden />

        <section className="hero">
          <div className="hero-copy">
            {/* Static: a pulse would claim something on this page is live. */}
            <span className="badge hero-eyebrow">
              <span className="badge-dot" aria-hidden />
              Live multiplayer
            </span>
            <h1 className="hero-title">
              Watch an agent work.
              <br />
              <em>Together.</em>
            </h1>
            <p className="hero-sub">
              Everyone on the link watches the same agent session as it runs.
              One person has the wheel, everyone else can suggest the next
              step, and the wheel can change hands mid-task.
            </p>

            <div className="hero-cta" id="start">
              <CommandBlock command="npx relayrun" />
              <span className="hero-cta-note">
                Run it in any git repository. It prints a link to share, and
                the agent works in a sandboxed clone on your machine. Needs an
                Anthropic API key or a Claude Code login.
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

            <RecentSessions />
          </div>

          <div className="hero-demo">
            <HeroLab />
          </div>
        </section>

        <div className="hatch" aria-hidden />

        <section className="lock" id="lock">
          <div className="lock-inner lock-grid">
            <div className="lock-head">
              <h2 className="section-title">One writer. Never two.</h2>
              <p className="lock-lede">
                Screen-sharing an agent gets you an audience. Relay gets you a
                relay: exactly one person has the wheel, the server enforces
                it, and everyone else can suggest the next step or ask to
                drive.
              </p>
            </div>
            <dl className="lock-facts">
              <div>
                <dt>Ask → hand over → release</dt>
                <dd>
                  A watcher asks for the wheel and the driver hands it over, on
                  every screen at once. A released wheel is free for anyone in
                  the room to take.
                </dd>
              </div>
              <div>
                <dt>Enforced on the server</dt>
                <dd>
                  Not a disabled button. The server rejects any instruction,
                  stop or publish that doesn&apos;t come from the driver, and
                  runs instructions one at a time, in order.
                </dd>
              </div>
              <div>
                <dt>Suggestions wait for the driver</dt>
                <dd>
                  Watchers can type too. Their suggestions wait in the dock,
                  signed in their colour, and reach the agent only if the
                  driver sends them.
                </dd>
              </div>
            </dl>
            <ProductTour />
          </div>
        </section>

        <div className="hatch" aria-hidden />

        <section className="lock" id="trust">
          <div className="lock-inner lock-grid">
            <div className="lock-head">
              <h2 className="section-title">Your repo stays on your machine.</h2>
              <p className="lock-lede">
                The agent runs on your laptop, in a fresh clone of your current
                commit, on your own Claude credentials. What crosses the network
                is the session itself: the commands the agent runs and their
                output, the files it opens, and the edits it makes.
              </p>
            </div>
            <dl className="lock-facts">
              <div>
                <dt>No upload, no clone on a server</dt>
                <dd>
                  Nothing to hand over before you start. The relay keeps the
                  transcript so a finished session&apos;s link still opens; it
                  never holds your repository.
                </dd>
              </div>
              <div>
                <dt>The server is a relay, not a runtime</dt>
                <dd>
                  It orders events, enforces the lock and fans out the
                  transcript. Your shell and credentials never reach it; of an
                  API key it sees only the last four characters.
                </dd>
              </div>
              <div>
                <dt>Sandboxed by default</dt>
                <dd>
                  The agent&apos;s commands can write only inside the
                  session&apos;s temporary folders, reach only package
                  registries and GitHub, and can&apos;t read your SSH keys,
                  cloud credentials or secret environment variables.
                </dd>
              </div>
            </dl>
            <TopologyDiagram />
          </div>
        </section>

        <div className="hatch" aria-hidden />

        <section className="how" id="how">
          <div className="how-inner">
            <h2 className="section-title">What happens when you run it</h2>
            <ol className="steps">
              <li className="step">
                <span className="step-n">01</span>
                <div className="step-body">
                  <h3 className="step-title">You start the agent</h3>
                  <p className="step-text">
                    <code>npx relayrun</code> in any git repository. The agent
                    works in a temporary clone of your current commit; the CLI
                    connects out to the relay and prints a link. Nothing
                    inbound, so no ports to open.
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
                    Every file the agent changes appears in the changes panel
                    with its diff. Whoever has the wheel publishes the work as
                    a branch in your repository, ready to check out, or as a
                    pull request if relayrun was given a GitHub repo and token.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="spec">
          <div className="spec-inner">
            <h2 className="section-title">What&apos;s actually running</h2>
            <dl className="spec-sheet">
              <div className="spec-row">
                <dt>Engine</dt>
                <dd>
                  Claude Agent SDK, the same agent loop and tools that power
                  Claude Code. Relay adds the room around it, not a different
                  model.
                </dd>
              </div>
              <div className="spec-row">
                <dt>Topology</dt>
                <dd>
                  The agent runs on the host&apos;s machine and streams events
                  up over one WebSocket. The server coordinates; your
                  repository stays put.
                </dd>
              </div>
              <div className="spec-row">
                <dt>Ordering</dt>
                <dd>
                  A server-assigned <code>seq</code> on every event, from a
                  single function. Clients render in that order and never sort.
                </dd>
              </div>
              <div className="spec-row">
                <dt>Isolation</dt>
                <dd>
                  A temporary clone of your current commit per session,
                  deleted when you stop relayrun. The agent&apos;s commands run
                  in an OS sandbox by default; <code>--no-sandbox</code>{" "}
                  removes it, for sessions where you trust everyone with the
                  link.
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
                  A 30-second grace window holds your identity — your seat
                  stays reserved through a wifi blip.
                </dd>
              </div>
              <div className="spec-row">
                <dt>Persistence</dt>
                <dd>
                  relayrun.in mirrors transcripts to Postgres, so a finished
                  session&apos;s link opens as a read-only replay instead of an
                  error.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Native <details name="faq"> gives an exclusive accordion with no JS. */}
        <section className="faq" id="faq">
          <div className="faq-inner faq-grid">
            <div className="faq-head">
              <span className="faq-eyebrow">Questions</span>
              <h2 className="section-title">Before you run it</h2>
              <p className="faq-lede">
                The things worth knowing before you paste this into a
                terminal.
              </p>
            </div>

            <div className="faq-list">
              <details className="faq-item" name="faq" open>
                <summary className="faq-q">
                  <span className="step-n">01</span>
                  <span className="faq-q-text">Where does my code go?</span>
                  <span className="faq-icon" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="faq-a">
                  The files the agent reads go to the Anthropic API, exactly as
                  in Claude Code. They also appear in the session transcript,
                  so everyone with the link sees them and the relay keeps them
                  for replay. Your repository as a whole is never uploaded.
                </p>
              </details>

              <details className="faq-item" name="faq">
                <summary className="faq-q">
                  <span className="step-n">02</span>
                  <span className="faq-q-text">
                    What can the agent do to my repo?
                  </span>
                  <span className="faq-icon" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="faq-a">
                  It works in a temporary clone of your current commit, not
                  your checkout. Its commands are sandboxed by default: writes
                  stay in the session&apos;s folders, network reaches only
                  package registries and GitHub, and your SSH keys, cloud
                  credentials and secret environment variables are off-limits.
                  Nothing reaches your repository until the driver publishes a
                  branch.
                </p>
              </details>

              <details className="faq-item" name="faq">
                <summary className="faq-q">
                  <span className="step-n">03</span>
                  <span className="faq-q-text">
                    Can someone watching change anything?
                  </span>
                  <span className="faq-icon" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="faq-a">
                  Not while someone has the wheel. Watchers can suggest
                  instructions and ask for the wheel; only the driver can send,
                  stop or publish. The server checks every message, so a
                  hand-crafted WebSocket frame gets the same answer as the
                  button. When the wheel is free, anyone in the room can take
                  it.
                </p>
              </details>

              <details className="faq-item" name="faq">
                <summary className="faq-q">
                  <span className="step-n">04</span>
                  <span className="faq-q-text">
                    What happens if I close my laptop?
                  </span>
                  <span className="faq-icon" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="faq-a">
                  The agent goes offline with it. A run in progress stops, and
                  the room stays open with the full transcript. When your
                  laptop wakes, relayrun reconnects to the session on its own,
                  as long as the session hasn&apos;t closed. Nothing runs while
                  it sleeps: that&apos;s the trade for keeping the repository
                  on your machine.
                </p>
              </details>

              <details className="faq-item" name="faq">
                <summary className="faq-q">
                  <span className="step-n">05</span>
                  <span className="faq-q-text">
                    Do I need to connect an account?
                  </span>
                  <span className="faq-icon" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="faq-a">
                  No. There&apos;s no Relay account and nothing to connect. You
                  need Node 20.9 or later, a git repository, and an Anthropic
                  API key or a Claude Code login. The sandbox runs on macOS,
                  Linux and WSL2; Linux needs bubblewrap and socat.
                </p>
              </details>

              <details className="faq-item" name="faq">
                <summary className="faq-q">
                  <span className="step-n">06</span>
                  <span className="faq-q-text">What does it cost?</span>
                  <span className="faq-icon" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="faq-a">
                  Nothing from Relay. Runs bill your own Anthropic API key
                  (pass <code>--api-key</code>) or run on your own Claude Code
                  login. The key is only ever sent to Anthropic; Relay sees its
                  last four characters, so the room can show which key is
                  paying. If someone else will drive, use a key:{" "}
                  <a
                    href="https://code.claude.com/docs/en/legal-and-compliance"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Anthropic&apos;s terms
                  </a>{" "}
                  don&apos;t allow routing other people&apos;s requests through
                  a Free, Pro or Max plan.
                </p>
              </details>
            </div>
          </div>
        </section>

        <section className="close">
          <h2 className="close-title">Run it. Send the link.</h2>
          <div className="close-cta">
            <CommandBlock command="npx relayrun" />
          </div>
        </section>

        <footer className="landing-foot">
          <div className="landing-foot-top">
            <div className="landing-foot-brand">
              <span className="landing-foot-mark">relay</span>
              <p className="landing-foot-tag">
                Live agent sessions, shared. One person drives, everyone
                watches, and the wheel changes hands{" "}
                <span className="landing-foot-keep">mid-task.</span>
              </p>
            </div>

            <nav className="landing-foot-col" aria-label="On this page">
              <span className="landing-foot-head">Product</span>
              <a href="#lock">What it is</a>
              <a href="#tour">How it works</a>
              <a href="#faq">Questions</a>
              <a href="#start" onClick={handleGetStarted}>
                Get started
              </a>
            </nav>

            <nav className="landing-foot-col" aria-label="Elsewhere">
              <span className="landing-foot-head">Resources</span>
              <a href="https://github.com/Avaya02/Relay" target="_blank" rel="noreferrer">
                GitHub ↗
              </a>
              <a href="https://www.npmjs.com/package/relayrun" target="_blank" rel="noreferrer">
                relayrun on npm ↗
              </a>
              <a
                href="https://code.claude.com/docs/en/agent-sdk/overview"
                target="_blank"
                rel="noreferrer"
              >
                Agent SDK ↗
              </a>
              <a href="https://github.com/Avaya02/Relay/releases" target="_blank" rel="noreferrer">
                Changelog ↗
              </a>
              <a href="https://github.com/Avaya02/Relay/issues/new" target="_blank" rel="noreferrer">
                Report an issue ↗
              </a>
              <ContactDialog />
            </nav>
          </div>

          <div className="landing-foot-base">
            <span>© 2026 Avaya Sharma</span>
            <span>Open source, MIT licensed</span>
          </div>

          {/* An image, not a CSS background, so it waits for the scroll. Unoptimized:
              re-encoding lossily smears the halftone screen (prepare-hero-image.py). */}
          <Image
            className="landing-foot-scene"
            src="/foot-ridge.webp"
            alt=""
            width={2400}
            height={960}
            unoptimized
          />
        </footer>
      </div>
    </div>
  );
}
