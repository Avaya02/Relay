import type { Participant } from "@relay/shared";

const HUES = 6;

function preferredHue(participantId: string): number {
  let hash = 0;
  for (let i = 0; i < participantId.length; i++) {
    hash = (hash * 31 + participantId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % HUES;
}

/** A colour for someone who may have left the room, so no longer in its list. */
export function hueOf(participantId: string): string {
  return `var(--hue-${preferredHue(participantId) + 1})`;
}

/**
 * Everyone in the room gets their own colour. Hashing alone collides often
 * (three people across six hues share one 44% of the time), so each person
 * takes their hashed hue unless someone who joined earlier holds it. The
 * list arrives in join order from the server, so every screen assigns the
 * same colours. When the earlier holder leaves, the person they displaced
 * moves to their own hue — on every screen at once, which is the property
 * that matters: "I'm the pink one" has to be true for everybody.
 */
export function assignHues(participants: Participant[]): Map<string, string> {
  const taken = new Set<number>();
  const out = new Map<string, string>();
  for (const p of participants) {
    let hue = preferredHue(p.id);
    if (taken.size < HUES) {
      while (taken.has(hue)) hue = (hue + 1) % HUES;
    }
    taken.add(hue);
    out.set(p.id, `var(--hue-${hue + 1})`);
  }
  return out;
}

/** "Avaya Sharma" → "AS", "noor" → "N", "" → "?" */
export function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1);
  return parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1);
}
