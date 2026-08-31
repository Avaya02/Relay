"use client";

import { useEffect, useState } from "react";

// A replay of a REAL captured session — the transcript below is a trimmed,
// verbatim excerpt of an actual Relay run against a real repository (Claude
// Sonnet, 13 tool calls, 46s). It is a recording, not a live session, and the
// UI says so.
//
// Why replay rather than a screenshot: Relay's entire claim is temporal —
// "the same session, at the same moment, for everyone". A still image can't
// express that, and a video would be heavier and less crisp than the actual
// DOM. This renders the real ledger components, so what a visitor sees is the
// product's own surface, not a mockup of it.
//
// It also carries the part of the pitch that's hardest to describe: you watch
// as the *viewer*, see the composer locked, and watch control hand over to you.

type Step =
  | { kind: "instruction"; who: string; text: string }
  | { kind: "text"; text: string }
  | { kind: "action"; verb: string; target: string; result: string; ok?: boolean }
  | { kind: "handover" }
  | { kind: "done"; summary: string };

const SCRIPT: Step[] = [
  { kind: "instruction", who: "avi", text: "Explore this repo and write me a summary as REPORT.md" },
  { kind: "action", verb: "ran", target: "pwd && ls -la", result: "22 lines" },
  { kind: "action", verb: "read", target: "README.md", result: "100 lines" },
  { kind: "action", verb: "read", target: "package.json", result: "34 lines" },
  {
    kind: "text",
    text: "Now let me look at each package's dependencies and key source files.",
  },
  { kind: "action", verb: "read", target: "apps/api-server/src/app.ts", result: "28 lines" },
  { kind: "action", verb: "read", target: "apps/worker/src/index.ts", result: "68 lines" },
  { kind: "handover" },
  { kind: "action", verb: "read", target: "packages/evaluator/src/run-evaluation.ts", result: "31 lines" },
  { kind: "action", verb: "wrote", target: "REPORT.md", result: "written" },
  { kind: "done", summary: "13 steps · 46s · $0.04" },
];

const STEP_MS = 760;
const HOLD_MS = 4200;

/**
 * Rows the replay never drops below, including when it loops.
 *
 * Rewinding to zero blanked the frame outright: measured, the pane went from
 * fully rendered to 0% filled about a second after load, which reads as the
 * demo breaking rather than as a replay starting. Keeping the driver's
 * instruction and the first call on screen means the frame is never empty and
 * the loop still reads as a restart.
 */
const REPLAY_FLOOR = 2;

export function DemoLedger() {
  // Starts fully rendered, which is also what the server emits — the replay is
  // an enhancement on top of a complete default. Reduced motion, a hidden tab,
  // a headless render, or JS failing all leave the whole transcript visible
  // rather than an empty frame.
  const [shown, setShown] = useState(SCRIPT.length);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Every state change happens inside the timeout, never in the effect body,
    // so the first paint always matches the server's markup.
    const delay = !started
      ? 700
      : shown >= SCRIPT.length
        ? HOLD_MS
        : STEP_MS;
    const t = setTimeout(() => {
      if (!started) {
        setStarted(true);
        setShown(REPLAY_FLOOR);
        return;
      }
      setShown((n) => (n >= SCRIPT.length ? REPLAY_FLOOR : n + 1));
    }, delay);
    return () => clearTimeout(t);
  }, [started, shown]);

  const visible = SCRIPT.slice(0, shown);
  const handedOver = visible.some((s) => s.kind === "handover");
  const finished = visible.some((s) => s.kind === "done");

  return (
    <div className="demo-frame">
      <div className="demo-chrome">
        <div className="demo-chrome-left">
          <span className="demo-mark">relay</span>
          <span className="demo-session">4Kp2xQmN</span>
        </div>
        <div className="demo-chrome-right">
          <span className={finished ? "demo-status" : "demo-status demo-status--live"}>
            {finished ? "done" : "working"}
          </span>
          <span className="demo-person">
            <i className="demo-dot" style={{ background: "var(--presence-2)" }} />
            avi{!handedOver && <b> driving</b>}
          </span>
          <span className="demo-person">
            <i className="demo-dot" style={{ background: "var(--presence-1)" }} />
            you{handedOver && <b> driving</b>}
          </span>
        </div>
      </div>

      <div className="demo-body">
        <div className="ledger-rail flex flex-col">
          {visible.map((step, i) => (
            <DemoRow key={i} step={step} />
          ))}
        </div>
      </div>

      {/* The lock, shown rather than described: you are the viewer, so the
          composer isn't yours until control moves. */}
      <div className={handedOver ? "demo-bar demo-bar--driving" : "demo-bar"}>
        {handedOver ? (
          <>
            <span className="demo-bar-input">Type an instruction…</span>
            <span className="demo-bar-send">Send</span>
          </>
        ) : (
          <>
            <span className="demo-bar-label">
              <b>avi</b> is driving
            </span>
            <span className="demo-bar-action">Request control</span>
          </>
        )}
      </div>
    </div>
  );
}

function DemoRow({ step }: { step: Step }) {
  switch (step.kind) {
    case "instruction":
      return (
        <div className="ledger-item ledger-instruction">
          <span className="text-[var(--accent)]">{step.who}</span>
          <span className="text-[var(--text-dim)]"> → </span>
          <span className="text-[var(--text)]">{step.text}</span>
        </div>
      );
    case "text":
      return (
        <div className="ledger-item ledger-prose text-[var(--text)]">
          {step.text}
        </div>
      );
    case "action":
      return (
        <div className="ledger-item ledger-action">
          <span className="ledger-marker text-[var(--text-dim)]" aria-hidden>
            ✓
          </span>
          <span className="ledger-verb">{step.verb}</span>
          <span className="ledger-target">{step.target}</span>
          <span className="ledger-result">{step.result}</span>
          <span className="ledger-time" />
          <span />
        </div>
      );
    case "handover":
      return (
        <div className="ledger-item demo-handover">
          <span aria-hidden>⇄</span> avi handed control to you
        </div>
      );
    case "done":
      return (
        <div className="ledger-item ledger-done">— done · {step.summary} —</div>
      );
  }
}
