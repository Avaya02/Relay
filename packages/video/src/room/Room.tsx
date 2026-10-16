import type { CSSProperties } from "react";
import { prog, sec } from "../time";
import { AVI, RUN_1, type Person } from "../script";
import { Changes } from "./Changes";
import { Dock, type Hot } from "./Dock";
import { Header } from "./Header";
import { Intro } from "./Intro";
import { Transcript } from "./Transcript";
import { driverColour } from "./state";

// One person's view of the session, built from the session page's own classes.
// Wide is the room as a desktop window shows it, with the Changes panel open;
// otherwise it's the half-width room of a split screen.
export function Room({ f, viewer, hot, wide = false }: { f: number; viewer: Person; hot: Hot; wide?: boolean }) {
  // Only the host saw the empty room; it gives way as the first instruction lands.
  const intro = viewer.id === AVI.id ? 1 - prog(f, RUN_1.start, sec(0.2)) : 0;
  return (
    <div
      className={wide ? "room droom tour-wide" : "room droom"}
      style={{ "--driver": driverColour(f) } as CSSProperties}
    >
      <div className="room-col">
        <Header f={f} viewer={viewer} wide={wide} />
        <div className="room-body">
          <div className="room-main">
            <div className="tour-stage">
              {intro > 0 && <Intro opacity={intro} />}
              <Transcript f={f} viewer={viewer} />
            </div>
            <Dock f={f} viewer={viewer} hot={hot} />
          </div>
          {wide && <Changes f={f} />}
        </div>
      </div>
    </div>
  );
}
