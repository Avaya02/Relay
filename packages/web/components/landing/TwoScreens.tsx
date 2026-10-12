"use client";

import { useEffect, useRef, useState } from "react";
import type { Participant } from "@relay/shared";
import { ControlBar } from "@/components/ControlBar";

// Both screens render from one piece of state, differing only in `selfId`, so the
// real ControlBar works in both. Not "you": ControlBar would render "you is driving".
const AVI: Participant = { id: "p-avi", displayName: "avi" };
const NOOR: Participant = { id: "p-noor", displayName: "noor" };
const PARTICIPANTS = [AVI, NOOR];

const SESSION_ID = "4Kp2xQmN";
const SESSION_URL = `relayrun.in/session/${SESSION_ID}`;

type Step =
  | { kind: "instruction"; who: string; text: string }
  | { kind: "text"; text: string }
  | { kind: "action"; verb: string; target: string; result: string; failed?: boolean }
  | { kind: "request" }
  | { kind: "handover" }
  | { kind: "done"; summary: string };

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
  // No transcript row on purpose: the request shows in the control bar only.
  { kind: "request" },
  { kind: "handover" },
  { kind: "instruction", who: "noor", text: "Run the tests before wiring it in" },
  { kind: "action", verb: "ran", target: "pnpm test middleware", result: "2 failed", failed: true },
  { kind: "action", verb: "wrote", target: "middleware/rate-limit.ts", result: "+6 −2" },
  { kind: "action", verb: "ran", target: "pnpm test middleware", result: "14 passed" },
  { kind: "done", summary: "11 steps · 1m 12s" },
];

// The request and handover are the beats that matter, so they dwell longest.
const DWELL: Record<Step["kind"], number> = {
  instruction: 1200,
  action: 520,
  text: 950,
  request: 2400,
  handover: 2600,
  done: 4200,
};

// An emptied frame reads as the demo breaking, so the loop never rewinds past this.
const FLOOR = 2;

// Longer than the shortest dwell (520ms) so consecutive rows drift, not jump.
const SCROLL_MS = 900;

export function TwoScreens() {
  const [shown, setShown] = useState(SCRIPT.length);
  const [started, setStarted] = useState(false);
  const [looping, setLooping] = useState(false);
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // First paint is the whole transcript (SSR, reduced motion), so the 300px
  // pre-roll is where it rewinds to the opening frame, unseen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
      // Fade out via `looping` first; rows vanishing in one frame look broken.
      if (shown >= SCRIPT.length) setLooping(true);
      else setShown((n) => n + 1);
    }, delay);
    return () => clearTimeout(t);
  }, [inView, started, shown]);

  useEffect(() => {
    if (!looping) return;
    const t = setTimeout(() => {
      setShown(FLOOR);
      setLooping(false);
    }, 320);
    return () => clearTimeout(t);
  }, [looping]);

  const visible = SCRIPT.slice(0, shown);
  const handedOver = visible.some((s) => s.kind === "handover");
  const requested = visible.some((s) => s.kind === "request");

  const driverId = handedOver ? NOOR.id : AVI.id;
  const pending = requested && !handedOver ? [NOOR] : [];

  return (
    // inert, not aria-hidden: aria-hidden would leave ControlBar's controls
    // focusable inside a hidden subtree.
    <div className="on-photo" inert ref={rootRef}>
      <div className={looping ? "twoscreen twoscreen--looping" : "twoscreen"}>
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

  // Not CSS `scroll-behavior: smooth`: it has no duration knob and snaps at these distances.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const to = el.scrollHeight - el.clientHeight;
    const from = el.scrollTop;
    if (to <= from) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.scrollTop = to;
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / SCROLL_MS);
      el.scrollTop = from + (to - from) * (1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown]);

  const driving = self.id === driverId;

  return (
    <div className={driving ? "screen screen--driving" : "screen"}>
      <div className="screen-chrome">
        <span className="screen-lights" aria-hidden>
          <i className="screen-light screen-light--close" />
          <i className="screen-light screen-light--min" />
          <i className="screen-light screen-light--max" />
        </span>
        <span className="screen-url">{SESSION_URL}</span>
        <span className="screen-user">{self.displayName}</span>
      </div>

      <div className="screen-body" ref={bodyRef}>
        <div className="ledger-rail">
          {visible.map((step, i) => (
            <Row key={i} step={step} />
          ))}
        </div>
      </div>

      {/* Keyed on the driver so the flip animation replays on both screens. */}
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
    case "request":
      return null;
    case "done":
      return <div className="ledger-item ledger-done">— done · {step.summary} —</div>;
  }
}
