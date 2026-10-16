import type { CSSProperties } from "react";
import { Hand } from "lucide-react";
import { PresenceAvatar } from "@/components/room/PresenceAvatar";
import type { Person } from "./model";

// Same geometry as presence.css (24px discs overlapping 2px; the driver's slot
// opens 3px each side so the ring, 4px proud, clears its neighbours). Positions
// are computed rather than laid out by margins so one ring element can glide
// between slots on a CSS transform, without the room's motion library.
const DISC = 24;
const OVERLAP = 2;
const OPEN = 3;
const RING = 4;

function slotX(i: number, driver: number): number {
  const base = i * (DISC - OVERLAP);
  if (driver < 0 || i < driver) return base;
  const lead = driver > 0 ? OPEN + OVERLAP : OPEN;
  return i === driver ? base + lead : base + lead + OPEN + OPEN + OVERLAP;
}

export function DemoRoster({
  people,
  driverId,
  asking,
}: {
  people: Person[];
  driverId: string | null;
  asking: string | null;
}) {
  const d = people.findIndex((p) => p.id === driverId);
  const last = people.length - 1;
  const width = slotX(last, d) + DISC + (d === last ? OPEN : 0);

  return (
    <span className="roster droom-roster">
      <span className="roster-stack droom-stack" style={{ width }}>
        {people.map((p, i) => (
          <span
            key={p.id}
            className="roster-slot droom-slot"
            style={{ "--hue": p.hue, "--x": `${slotX(i, d)}px`, zIndex: i === d ? 1 : undefined } as CSSProperties}
          >
            <PresenceAvatar participant={{ displayName: p.name }} hue={p.hue} />
            {asking === p.id && (
              <span className="roster-asking">
                <Hand size={9} strokeWidth={2.5} />
              </span>
            )}
          </span>
        ))}
        {d >= 0 && (
          <span
            className="wheel-ring droom-ring"
            style={{ "--hue": people[d].hue, "--x": `${slotX(d, d) - RING}px` } as CSSProperties}
          />
        )}
      </span>
    </span>
  );
}
