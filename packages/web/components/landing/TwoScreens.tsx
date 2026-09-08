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

// One id, rendered in both address bars and in the frame's own header. Same
// URL on two machines is the claim this section makes, so it is stated once
// here rather than typed out per screen.
const SESSION_ID = "4Kp2xQmN";
const SESSION_URL = `relayrun.in/session/${SESSION_ID}`;

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

// How long the transcript takes to settle after a row lands. Deliberately
// longer than the shortest dwell (an action, at 520ms) so consecutive rows
// hand off to one continuous drift rather than a series of jumps.
const SCROLL_MS = 900;

export function TwoScreens() {
  const [shown, setShown] = useState(SCRIPT.length);
  const [started, setStarted] = useState(false);
  const [looping, setLooping] = useState(false);
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // The replay used to start on mount, which meant it had already run for as
  // long as the visitor took to scroll here — they arrived at whatever frame
  // it happened to be on. It now waits until it is nearly on screen, and
  // stops again when it leaves: an animation nobody can see is just timers.
  //
  // The 300px pre-roll is doing a second job. First paint is the WHOLE
  // transcript, so that a pre-hydration paint and anyone with reduced motion
  // (for whom the loop never runs) gets something complete rather than two
  // orphaned rows. That means the run has to rewind to its opening frame
  // once before it can play — and the margin is where that happens, while
  // the frame is still below the fold with nobody watching.
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
      // Ending the run raises `looping` rather than rewinding on the spot —
      // twelve rows vanishing between two frames read as the demo breaking.
      if (shown >= SCRIPT.length) setLooping(true);
      else setShown((n) => n + 1);
    }, delay);
    return () => clearTimeout(t);
  }, [inView, started, shown]);

  // The rewind itself, once the fade has had time to land.
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
  // The request is pending only in the window between asking and being granted.
  const pending = requested && !handedOver ? [NOOR] : [];

  return (
    // inert, not aria-hidden: this is a depiction of a claim the prose above
    // already makes, and aria-hidden alone would leave ControlBar's buttons and
    // select in the tab order — focusable controls inside a hidden subtree.
    <div className="on-photo" inert ref={rootRef}>
      {/* No Relay-branded bar above these. Two browser windows sitting under
          one piece of this app's own chrome read as Relay containing browsers
          containing Relay — and the shared seq counter it carried has been
          made redundant by the address bars, which prove the two windows are
          on one session far better than a number did: same URL, two machines. */}
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

  // Driven here rather than by CSS `scroll-behavior: smooth`, which has no
  // duration knob — the platform picks one, and its choice is a fast snap at
  // these distances. A row landing should read as the transcript settling,
  // so this eases it out over SCROLL_MS instead.
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
      // ease-out cubic: quick to commit, long to settle.
      el.scrollTop = from + (to - from) * (1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown]);

  const driving = self.id === driverId;

  return (
    <div className={driving ? "screen screen--driving" : "screen"}>
      {/* A window, not a panel. Two browser frames around one identical
          transcript say "two people, two machines" in a way a name label
          above a bordered box never did — and the address bar carries the
          proof, because it is the same URL in both.

          The lights are macOS's own, including the part everyone forgets:
          an unfocused window greys them out. So colour here marks which
          screen holds the lock rather than decorating the frame, and the
          handover moves it from one window to the other — which is the beat
          this whole section exists for. */}
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
