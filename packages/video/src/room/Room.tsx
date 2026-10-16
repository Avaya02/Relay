import type { CSSProperties } from "react";
import { prog, sec } from "../time";
import { AVI, RUN_1, type Person } from "../script";
import { Dock, type Hot } from "./Dock";
import { Header } from "./Header";
import { Intro } from "./Intro";
import { Transcript } from "./Transcript";
import { driverColour } from "./state";

// One person's view of the session, built from the session page's own classes.
export function Room({ f, viewer, hot }: { f: number; viewer: Person; hot: Hot }) {
  // Only the host saw the empty room; it gives way as the first instruction lands.
  const intro = viewer.id === AVI.id ? 1 - prog(f, RUN_1.start, sec(0.2)) : 0;
  return (
    <div className="room droom" style={{ "--driver": driverColour(f) } as CSSProperties}>
      <Header f={f} viewer={viewer} />
      <div className="tour-stage">
        {intro > 0 && <Intro opacity={intro} />}
        <Transcript f={f} viewer={viewer} />
      </div>
      <Dock f={f} viewer={viewer} hot={hot} />
    </div>
  );
}
