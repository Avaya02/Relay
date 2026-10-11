"use client";

import type { CSSProperties, ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { Tooltip } from "radix-ui";
import { HueProvider } from "./hues";
import type { usePanels } from "./usePanels";

/**
 * The room's skeleton, shared by a live session and a replayed one so ending
 * a session doesn't turn it into a different app: sessions on the left, the
 * stream and dock in the middle, changes on the right.
 */
export function RoomFrame({
  hues,
  driverHue,
  panels,
  rail,
  header,
  changes,
  children,
}: {
  hues: Map<string, string>;
  /** Whoever has the wheel lends the room their colour; nobody, and it's grey. */
  driverHue: string | undefined;
  panels: ReturnType<typeof usePanels>;
  rail: ReactNode;
  header: ReactNode;
  changes: ReactNode;
  children: ReactNode;
}) {
  return (
    <HueProvider hues={hues}>
      <Tooltip.Provider delayDuration={400} skipDelayDuration={200}>
        <MotionConfig reducedMotion="user">
          <div
            className="room"
            style={driverHue ? ({ "--driver": driverHue } as CSSProperties) : undefined}
          >
            {panels.sessionsOpen && rail}
            <div className="room-col">
              {header}
              <div className="room-body">
                <div className="room-main">{children}</div>
                {panels.changesOpen && changes}
              </div>
            </div>
            {panels.floating && (
              <button
                type="button"
                className="room-scrim"
                tabIndex={-1}
                aria-label="Close panel"
                onClick={panels.closePeek}
              />
            )}
          </div>
        </MotionConfig>
      </Tooltip.Provider>
    </HueProvider>
  );
}
