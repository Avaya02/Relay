"use client";

import type { CSSProperties } from "react";
import { DemoRoom } from "./demo-room/DemoRoom";
import { TWO } from "./demo-room/twoScript";
import { useTimeline } from "./demo-room/useTimeline";

// Ten characters from the server's alphabet, like a real session id.
const SESSION_URL = "relayrun.in/session/4Kp2xQmN7a";

// One frame of state rendered twice, differing only in whose seat it's seen
// from: the proof is that both windows change in the same frame.
export function TwoScreens() {
  const { rootRef, index, phase, played, paused, toggle } = useTimeline(TWO.dwells, TWO.start);
  const frame = TWO.frames[index];

  return (
    <figure className="on-photo twoscreen-figure" ref={rootRef}>
      {/* inert, not aria-hidden: aria-hidden would leave its buttons focusable. */}
      <div className="twoscreen" inert>
        <div className="twoscreen-grid">
          {TWO.people.map((person) => (
            <div key={person.id} className="screen">
              <div className="screen-chrome">
                <span className="screen-lights">
                  <i className="screen-light" />
                  <i className="screen-light" />
                  <i className="screen-light" />
                </span>
                <span className="screen-url">{SESSION_URL}</span>
                <span className="screen-user" style={{ "--hue": person.hue } as CSSProperties}>
                  {person.name}
                </span>
              </div>
              <div className="screen-room">
                <DemoRoom
                  frame={frame}
                  people={TWO.people}
                  selfId={person.id}
                  repo="api"
                  model="sonnet-5"
                  phase={phase}
                  played={played}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="demo-note">
        <span>
          Scripted demo, not a live session.
          <span className="sr-only">
            {" "}
            Avi&apos;s screen and Himanshu&apos;s show the same session. Himanshu asks for the wheel, and
            only Avi&apos;s screen shows the request. He hands it over, and both screens change at
            once: the ring moves to Himanshu and the room takes on Himanshu&apos;s colour.
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
