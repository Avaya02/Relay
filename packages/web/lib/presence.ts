const PRESENCE_COLORS = [
  "var(--presence-1)",
  "var(--presence-2)",
  "var(--presence-3)",
  "var(--presence-4)",
];

// Stable per participant regardless of join/leave order — hashing the id
// rather than the array index means nobody's colour changes because someone
// else disconnected.
export function colorFor(participantId: string): string {
  let hash = 0;
  for (let i = 0; i < participantId.length; i++) {
    hash = (hash * 31 + participantId.charCodeAt(i)) | 0;
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

/** "Avaya Sharma" → "AS", "noor" → "N", "" → "?" */
export function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1);
  return parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1);
}
