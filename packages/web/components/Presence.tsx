import type { Participant } from "@relay/shared";

const PRESENCE_COLORS = [
  "var(--presence-1)",
  "var(--presence-2)",
  "var(--presence-3)",
  "var(--presence-4)",
];

// Stable per participant regardless of join/leave order elsewhere in the
// list — hashing the id (rather than array index) means nobody's dot
// changes color just because someone else disconnected.
function colorFor(participantId: string): string {
  let hash = 0;
  for (let i = 0; i < participantId.length; i++) {
    hash = (hash * 31 + participantId.charCodeAt(i)) | 0;
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

export function Presence({
  participants,
  driverId,
  selfId,
}: {
  participants: Participant[];
  driverId: string | null;
  selfId: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      {participants.map((p) => {
        const isDriving = p.id === driverId;
        const label = p.id === selfId ? "you" : p.displayName;
        return (
          <span
            key={p.id}
            className="flex items-center gap-1.5 font-mono text-xs text-[var(--text-dim)]"
            title={isDriving ? `${p.displayName} — driving` : p.displayName}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(p.id) }}
              aria-hidden
            />
            {label}
            {isDriving && <span className="text-[var(--text)]">driving</span>}
          </span>
        );
      })}
    </div>
  );
}
