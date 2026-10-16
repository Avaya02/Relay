"use client";

import { DemoRoom } from "./demo-room/DemoRoom";
import { HERO } from "./demo-room/heroScript";
import { useTimeline } from "./demo-room/useTimeline";

export function HeroDemo() {
  const { rootRef, index, phase, played, paused, toggle } = useTimeline(HERO.dwells, HERO.start);

  return (
    <figure className="hero-demo-figure" ref={rootRef}>
      {/* inert, not aria-hidden: aria-hidden would leave its buttons focusable. */}
      <div className="hero-demo-frame" inert>
        <DemoRoom
          frame={HERO.frames[index]}
          people={HERO.people}
          selfId={HERO.selfId}
          repo="api"
          model="sonnet-5"
          phase={phase}
          played={played}
        />
      </div>
      <figcaption className="demo-note hero-demo-note">
        <span>
          Scripted demo, not a live session.
          <span className="sr-only">
            {" "}
            Avi has the wheel while the agent adds a rate limiter. Himanshu suggests a test, Avi
            sends it, the test fails, and Avi hands the wheel to you before the fix lands.
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
