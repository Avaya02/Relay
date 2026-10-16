import type { CSSProperties } from "react";
import { useHeld } from "../demo-room/motion";
import type { DemoSuggestion, Person } from "../demo-room/model";

// Everyone in the room as a row of seats. One white thumb marks the wheel and
// slides to the new driver on a handover: the relay, made literal.
export function Seats({
  people,
  driverId,
  selfId,
  suggestions,
}: {
  people: Person[];
  driverId: string | null;
  selfId: string;
  suggestions: DemoSuggestion[];
}) {
  const driver = Math.max(0, people.findIndex((p) => p.id === driverId));
  const live = suggestions[0] ?? null;
  // Held after it's sent, so the card lifts away instead of vanishing.
  const shown = useHeld(live, live !== null);
  const author = shown ? people.find((p) => p.id === shown.by) : undefined;
  const at = shown ? people.findIndex((p) => p.id === shown.by) : 0;

  return (
    <div
      className="lab-bar"
      style={{ "--n": people.length, "--i": driver, "--j": at } as CSSProperties}
    >
      {shown && author && (
        <div className="lab-sugg" data-leaving={live === null || undefined}>
          <span className="lab-sugg-by">{author.name} suggests</span>
          <p className="lab-sugg-text">{shown.text}</p>
        </div>
      )}
      <div className="lab-seats">
        <span className="lab-thumb" />
        {people.map((p) => {
          const driving = p.id === driverId;
          return (
            <div key={p.id} className="lab-seat" data-driving={driving || undefined}>
              <span className="lab-avatar">{p.name.slice(0, 1)}</span>
              <span className="lab-seat-text">
                <b>{p.id === selfId ? "You" : p.name}</b>
                {/* Not "has the wheel": the seat reads "You has the wheel". */}
                <small>{driving ? "at the wheel" : "watching"}</small>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
