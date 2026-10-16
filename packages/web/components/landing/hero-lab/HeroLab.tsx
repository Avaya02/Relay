"use client";

import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { HeroDemo } from "../HeroDemo";
import { PlayedCtx } from "../demo-room/motion";
import { useTimeline } from "../demo-room/useTimeline";
import { LAB } from "./labScript";
import { Seats } from "./Seats";
import { TerminalView } from "./TerminalView";
import { ThreadView } from "./ThreadView";

type Variant = "thread" | "terminal" | "room";

// Temporary: ?hero=thread|terminal|room picks a direction to compare in place.
function readVariant(): Variant {
  const v = new URLSearchParams(window.location.search).get("hero");
  return v === "terminal" || v === "room" ? v : "thread";
}
const noSubscribe = () => () => {};

export function HeroLab() {
  const variant = useSyncExternalStore(noSubscribe, readVariant, (): Variant => "thread");
  if (variant === "room") return <HeroDemo />;
  return <LabHero variant={variant} />;
}

function LabHero({ variant }: { variant: "thread" | "terminal" }) {
  const { rootRef, index, phase, played, paused, toggle } = useTimeline(LAB.dwells, LAB.start);
  const frame = LAB.frames[index];
  const View = variant === "terminal" ? TerminalView : ThreadView;

  return (
    <figure className="hero-demo-figure" ref={rootRef}>
      <PlayedCtx.Provider value={played}>
        {/* inert: a picture of the product, not a control surface. */}
        <div
          className="hero-demo-frame lab"
          data-variant={variant}
          data-phase={phase === "play" ? undefined : phase}
          // The card floats over the stream's foot; this lifts the stream clear of it.
          data-sugg={frame.suggestions.length > 0 || undefined}
          inert
        >
          <header className="lab-head">
            <span className="lab-head-id">
              <span className="lab-mark">relay</span>
              <span>4Kp2xQmN7a</span>
            </span>
            <span className="lab-status" data-working={frame.working || undefined}>
              {frame.working ? <i className="lab-dot" /> : <Check size={12} strokeWidth={2.5} />}
              {frame.working ? "Working" : "Done"}
            </span>
          </header>
          <div className="lab-stage">
            <div className="lab-measure">
              <View turns={frame.turns} people={LAB.people} selfId={LAB.selfId} />
            </div>
          </div>
          <Seats
            people={LAB.people}
            driverId={frame.driverId}
            selfId={LAB.selfId}
            suggestions={frame.suggestions}
          />
        </div>
      </PlayedCtx.Provider>
      <figcaption className="demo-note hero-demo-note">
        <span>
          <span className="sr-only">
            {" "}
            Avi has the wheel while the agent adds a rate limiter. Himanshu suggests running the
            tests, Avi sends it, a test fails, and Avi hands the wheel to you to fix it.
          </span>
        </span>
        <button
          type="button"
          className="demo-toggle"
          onClick={toggle}
          aria-label={paused ? "Play the demo" : "Pause the demo"}
        >
          {paused ? "Play" : "Pause"}
        </button>
      </figcaption>
    </figure>
  );
}
