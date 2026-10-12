// There's no auth, so payloads are the trust boundary. Returns a result instead of
// throwing: a throw in the WS message loop takes down more than one message.
export type Checked<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ok = <T,>(value: T): Checked<T> => ({ ok: true, value });
const bad = (error: string): Checked<never> => ({ ok: false, error });

export const LIMITS = {
  displayName: 32,
  instruction: 10_000,
  publishTitle: 120,
} as const;

// Strips controls and zero-width/bidi characters that let a name render as
// something else (RTL override). Tab/newline/CR are left to callers that allow them.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;
const INVISIBLE = /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\uFEFF]/g;

function scrub(raw: string): string {
  return raw.replace(CONTROL, "").replace(INVISIBLE, "");
}

// Truncated, not rejected: someone pasting a long string wants a name, not an error.
export function displayName(raw: unknown): Checked<string> {
  if (typeof raw !== "string") return bad("display name is required");
  const cleaned = scrub(raw).replace(/\s+/g, " ").trim();
  if (!cleaned) return bad("display name is required");
  return ok(cleaned.slice(0, LIMITS.displayName));
}

// Keeps newlines (a pasted stack trace is valid). Rejects over-length rather
// than truncating: half an instruction is a different instruction.
export function instruction(raw: unknown): Checked<string> {
  if (typeof raw !== "string") return bad("instruction is required");
  const cleaned = scrub(raw).trim();
  if (!cleaned) return bad("instruction is empty");
  if (cleaned.length > LIMITS.instruction) {
    return bad(`instruction is too long (max ${LIMITS.instruction} characters)`);
  }
  return ok(cleaned);
}

export function publishTitle(raw: unknown): Checked<string> {
  if (typeof raw !== "string") return bad("a title is required");
  const cleaned = scrub(raw).replace(/\s+/g, " ").trim();
  if (!cleaned) return bad("a title is required");
  return ok(cleaned.slice(0, LIMITS.publishTitle));
}

// Agent errors can echo a key and are persisted and broadcast. The runner scrubs
// its own output too; this guards the receiving end.
const KEY_LIKE = /sk-ant-[A-Za-z0-9_-]+/g;

export function redactKeys(text: string): string {
  return text.replace(KEY_LIKE, (m) => `sk-ant-…${m.slice(-4)}`);
}
