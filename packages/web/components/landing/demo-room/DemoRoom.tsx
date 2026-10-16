import type { CSSProperties } from "react";
import { DemoDock } from "./DemoDock";
import { DemoHeader } from "./DemoHeader";
import { DemoPlanBar } from "./DemoPlanBar";
import { DemoTranscript } from "./DemoTranscript";
import { PlayedCtx } from "./motion";
import type { DemoFrame, Person } from "./model";
import type { Phase } from "./useTimeline";

// One person's view of the room, built from the session page's own classes (and
// `.room` itself, which maps the landing's tokens to the room palette), so the
// demo can only look like the product.
export function DemoRoom({
  frame,
  people,
  selfId,
  repo,
  model,
  phase,
  played,
}: {
  frame: DemoFrame;
  people: Person[];
  selfId: string;
  repo: string;
  model: string;
  phase: Phase;
  played: boolean;
}) {
  const driver = people.find((p) => p.id === frame.driverId);
  return (
    <PlayedCtx.Provider value={played}>
      <div
        className="room droom"
        data-phase={phase === "play" ? undefined : phase}
        style={driver ? ({ "--driver": driver.hue } as CSSProperties) : undefined}
      >
        <DemoHeader frame={frame} people={people} selfId={selfId} repo={repo} />
        {frame.plan && <DemoPlanBar plan={frame.plan} />}
        <DemoTranscript turns={frame.turns} people={people} selfId={selfId} />
        <DemoDock frame={frame} people={people} selfId={selfId} repo={repo} model={model} />
      </div>
    </PlayedCtx.Provider>
  );
}
