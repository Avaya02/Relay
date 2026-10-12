"use client";

import { useEffect, useRef, useState } from "react";

// A trimmed, verbatim excerpt of a real captured run (13 tool calls, 46s), not a
// live session; the UI says so.
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

// The handover changes three things at once; a flat 760ms dwell let them pass
// unnoticed, so it gets the longest beat.
const DWELL: Record<Step["kind"], number> = {
  instruction: 1100,
  action: 480,
  text: 900,
  handover: 2800,
  done: 4200,
};
const HOLD_MS = DWELL.done;

// Rewinding to zero blanked the pane (measured: fully rendered to 0% filled
// about a second after load), which reads as the demo breaking.
const REPLAY_FLOOR = 2;

export function DemoLedger() {
  // Starts fully rendered (as the server emits) so reduced motion, headless or
  // failed JS still show the whole transcript.
  const [shown, setShown] = useState(SCRIPT.length);
  const [started, setStarted] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Pin to the bottom, or the replay continues below the panel's fold and looks stalled.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [shown]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // State changes only inside the timeout so first paint matches the server's markup.
    // Dwell is keyed off the step that just landed, the one being looked at.
    const delay = !started
      ? 700
      : shown >= SCRIPT.length
        ? HOLD_MS
        : (DWELL[SCRIPT[shown - 1]?.kind] ?? DWELL.action);
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

      <div className="demo-body" ref={bodyRef}>
        <div className="ledger-rail flex flex-col">
          {visible.map((step, i) => (
            <DemoRow key={i} step={step} />
          ))}
        </div>
      </div>

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
          <span className="text-[var(--state-ok)]">{step.who}</span>
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
