"use client";

import { useEffect, useRef, useState } from "react";
import type { Participant } from "@relay/shared";
import { ControlBar } from "@/components/ControlBar";

// "One writer. Never two." argued in the only form that can actually prove it:
// the same session, at the same instant, on two people's screens.
//
// Both viewports render from ONE piece of state, so the transcripts cannot
// drift — that is the claim, made structurally rather than asserted. The only
// difference between the two halves is `selfId`, which is why the real
// ControlBar can be dropped into both: it already renders the driver's
// controls or the viewer's from that one prop. Nothing here re-implements the
// product to describe it.
//
// avi and noor rather than "avi and you": ControlBar renders
// "<name> is driving", so a participant literally named "you" produces "you is
// driving". The hero already puts the visitor in the seat; this section is the
// mechanism seen from outside, which is the right register for evidence.

const AVI: Participant = { id: "p-avi", displayName: "avi" };
const NOOR: Participant = { id: "p-noor", displayName: "noor" };
const PARTICIPANTS = [AVI, NOOR];

type Step =
  | { kind: "instruction"; who: string; text: string }
  | { kind: "text"; text: string }
  | { kind: "action"; verb: string; target: string; result: string; failed?: boolean }
  | { kind: "request" }
  | { kind: "handover" }
  | { kind: "done"; summary: string };

// A run that actually changes something: reads, a write, control moving
// mid-task, a failing test, then a green one. A transcript of pure reads would
// show the lock moving over work that did not matter.
const SCRIPT: Step[] = [
  {
    kind: "instruction",
    who: "avi",
    text: "Add a token-bucket rate limiter to the API, with tests",
  },
  { kind: "action", verb: "read", target: "apps/api/src/router.ts", result: "84 lines" },
  { kind: "action", verb: "read", target: "apps/api/src/middleware/", result: "6 files" },
  { kind: "text", text: "I'll add it as middleware and wire it into the router." },
  { kind: "action", verb: "wrote", target: "middleware/rate-limit.ts", result: "+52" },
  // Renders no transcript row on purpose. The request belongs in the control
  // bar, which is where a driver actually sees it — putting it in the ledger
  // too would say it twice and contradict noor's own bar, which still offers
  // "Request control" until the lock really moves.
  { kind: "request" },
  { kind: "handover" },
  { kind: "instruction", who: "noor", text: "Run the tests before wiring it in" },
  { kind: "action", verb: "ran", target: "pnpm test middleware", result: "2 failed", failed: true },
  { kind: "action", verb: "wrote", target: "middleware/rate-limit.ts", result: "+6 −2" },
  { kind: "action", verb: "ran", target: "pnpm test middleware", result: "14 passed" },
  { kind: "done", summary: "11 steps · 1m 12s" },
];

// Dwell per step kind. The request and the handover are the two beats this
// whole section exists for — everything else is the work they happen during.
const DWELL: Record<Step["kind"], number> = {
  instruction: 1200,
  action: 520,
  text: 950,
  request: 2400,
  handover: 2600,
  done: 4200,
};

// Never rewinds past the opening instruction: a frame that empties itself
// reads as the demo breaking rather than as a replay looping.
const FLOOR = 2;

export function TwoScreens() {
  const [shown, setShown] = useState(SCRIPT.length);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Every state change happens inside the timeout, so the first paint always
    // matches the server's markup.
    const delay = !started
      ? 800
      : shown >= SCRIPT.length
        ? DWELL.done
        : (DWELL[SCRIPT[shown - 1]?.kind] ?? DWELL.action);
    const t = setTimeout(() => {
      if (!started) {
        setStarted(true);
        setShown(FLOOR);
        return;
      }
      setShown((n) => (n >= SCRIPT.length ? FLOOR : n + 1));
    }, delay);
    return () => clearTimeout(t);
  }, [started, shown]);

  const visible = SCRIPT.slice(0, shown);
  const handedOver = visible.some((s) => s.kind === "handover");
  const requested = visible.some((s) => s.kind === "request");
  const finished = visible.some((s) => s.kind === "done");

  const driverId = handedOver ? NOOR.id : AVI.id;
  // The request is pending only in the window between asking and being granted.
  const pending = requested && !handedOver ? [NOOR] : [];

  return (
    // inert, not aria-hidden: this is a depiction of a claim the prose above
    // already makes, and aria-hidden alone would leave ControlBar's buttons and
    // select in the tab order — focusable controls inside a hidden subtree.
    <div className="on-photo" inert>
      <div className="twoscreen">
        <div className="twoscreen-head">
          <span className="twoscreen-mark">relay</span>
          <span className="twoscreen-session">4Kp2xQmN</span>
          {/* One counter, shared. Both halves render from it, so it is the
              cheapest possible proof that this is one stream and not two
              panels playing similar footage. */}
          <span className="twoscreen-seq">seq {shown}</span>
          <span className={finished ? "twoscreen-state" : "twoscreen-state twoscreen-state--live"}>
            {finished ? "done" : "working"}
          </span>
        </div>

        <div className="twoscreen-grid">
          <Screen self={AVI} driverId={driverId} pending={pending} visible={visible} shown={shown} />
          <Screen self={NOOR} driverId={driverId} pending={pending} visible={visible} shown={shown} />
        </div>
      </div>
    </div>
  );
}

const noop = () => {};

function Screen({
  self,
  driverId,
  pending,
  visible,
  shown,
}: {
  self: Participant;
  driverId: string;
  pending: Participant[];
  visible: Step[];
  shown: number;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown]);

  const driving = self.id === driverId;

  return (
    <div className="screen">
      <div className="screen-label">
        <i className={driving ? "screen-dot screen-dot--driving" : "screen-dot"} />
        <span className="screen-who">{self.displayName}</span>
        <span className="screen-role">{driving ? "driving" : "watching"}</span>
      </div>

      <div className="screen-body" ref={bodyRef}>
        <div className="ledger-rail">
          {visible.map((step, i) => (
            <Row key={i} step={step} />
          ))}
        </div>
      </div>

      {/* Keyed on the driver so the flip animation replays on both screens the
          moment the lock moves — the "at once" is the whole point, and a
          silent swap loses it. */}
      <div className="screen-control" key={driverId}>
        <ControlBar
          participants={PARTICIPANTS}
          driverId={driverId}
          selfId={self.id}
          pendingRequests={pending}
          onRequestControl={noop}
          onCancelRequest={noop}
          onHandOver={noop}
          onRelease={noop}
        />
      </div>
    </div>
  );
}

function Row({ step }: { step: Step }) {
  switch (step.kind) {
    case "instruction":
      return (
        <div className="ledger-item ledger-instruction">
          <span className="screen-who-said">{step.who}</span>
          <span className="text-[var(--text-dim)]"> → </span>
          <span className="text-[var(--text)]">{step.text}</span>
        </div>
      );
    case "text":
      return <div className="ledger-item ledger-prose">{step.text}</div>;
    case "action":
      return (
        <div className="ledger-item ledger-action">
          <span className="ledger-marker text-[var(--text-dim)]">{step.failed ? "✕" : "✓"}</span>
          <span className="ledger-verb">{step.verb}</span>
          <span className="ledger-target">{step.target}</span>
          <span className={step.failed ? "ledger-result screen-failed" : "ledger-result"}>
            {step.result}
          </span>
          <span className="ledger-time" />
          <span />
        </div>
      );
    case "handover":
      return (
        <div className="ledger-item screen-lock">
          <span>⇄</span> avi handed control to noor
        </div>
      );
    // The request lands in the control bar, not the transcript.
    case "request":
      return null;
    case "done":
      return <div className="ledger-item ledger-done">— done · {step.summary} —</div>;
  }
}
