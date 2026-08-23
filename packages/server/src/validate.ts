// Every piece of client-supplied text lands here before it reaches a
// transcript, a broadcast, a subprocess, or Postgres.
//
// Relay has no auth by design (PRODUCT.md: a link shared with people you're
// already on a call with). That is a deliberate trust boundary, and it is
// exactly why the payloads themselves have to be checked — "no accounts" and
// "no validation" are different decisions, and only the first one was made on
// purpose. Before this file, `join` with a 100,000-character display name was
// accepted and broadcast to every participant.
//
// Everything returns `{ ok: true, value }` or `{ ok: false, error }` rather
// than throwing: these run inside the WS message loop, where a throw takes
// down more than the one bad message.

export type Checked<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ok = <T,>(value: T): Checked<T> => ({ ok: true, value });
const bad = (error: string): Checked<never> => ({ ok: false, error });

export const LIMITS = {
  displayName: 32,
  instruction: 10_000,
  publishTitle: 120,
  apiKey: 300,
} as const;

// Strips C0/C1 controls and the zero-width/bidi characters that let a name
// render as something other than what it is (RTL override, invisible joiners).
// Tab, newline and carriage return are handled by the callers that allow them.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;
const INVISIBLE = /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\uFEFF]/g;

function scrub(raw: string): string {
  return raw.replace(CONTROL, "").replace(INVISIBLE, "");
}

/**
 * A name shown next to everything a person does, so it has to be short,
 * single-line, and actually present. Truncated rather than rejected on
 * length: someone pasting a long string wants a name, not an error.
 */
export function displayName(raw: unknown): Checked<string> {
  if (typeof raw !== "string") return bad("display name is required");
  const cleaned = scrub(raw).replace(/\s+/g, " ").trim();
  if (!cleaned) return bad("display name is required");
  return ok(cleaned.slice(0, LIMITS.displayName));
}

/**
 * Instruction text keeps its newlines — it's prose the agent reads, and a
 * pasted stack trace is a legitimate instruction. Only the length is capped,
 * and it's capped rather than trimmed silently: an instruction cut in half
 * would be a different instruction.
 */
export function instruction(raw: unknown): Checked<string> {
  if (typeof raw !== "string") return bad("instruction is required");
  const cleaned = scrub(raw).trim();
  if (!cleaned) return bad("instruction is empty");
  if (cleaned.length > LIMITS.instruction) {
    return bad(`instruction is too long (max ${LIMITS.instruction} characters)`);
  }
  return ok(cleaned);
}

/** Becomes a git commit subject and a PR title, so: one line, bounded. */
export function publishTitle(raw: unknown): Checked<string> {
  if (typeof raw !== "string") return bad("a title is required");
  const cleaned = scrub(raw).replace(/\s+/g, " ").trim();
  if (!cleaned) return bad("a title is required");
  return ok(cleaned.slice(0, LIMITS.publishTitle));
}

/**
 * An Anthropic API key, on its way into a subprocess environment.
 *
 * Deliberately shape-only: the authority on whether a key is *valid* is
 * Anthropic, and a strict pattern here would reject key formats that don't
 * exist yet. What this does guarantee is that the value can't carry a
 * newline or a shell metacharacter into an env var, and can't be a
 * megabyte of anything.
 */
export function apiKey(raw: unknown): Checked<string> {
  if (typeof raw !== "string") return bad("a key is required");
  const cleaned = raw.trim();
  if (!cleaned) return bad("a key is required");
  if (cleaned.length > LIMITS.apiKey) return bad("that key is too long");
  if (!cleaned.startsWith("sk-ant-")) {
    return bad("Anthropic keys start with sk-ant-");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(cleaned)) {
    return bad("that key contains characters an API key can't have");
  }
  return ok(cleaned);
}

/** Last four characters — the only part of a key that may leave the server. */
export function keyHint(key: string): string {
  return key.slice(-4);
}

// A key can reach an error string by way of the SDK (a failed auth echoing
// the value, a subprocess dumping its environment on crash). Agent errors are
// appended to the transcript, broadcast to the whole room, and mirrored to
// Postgres — so anything on that path gets scrubbed first. Belt and braces:
// nothing is known to leak keys today, and this is cheap insurance if
// something starts to.
const KEY_LIKE = /sk-ant-[A-Za-z0-9_-]+/g;

export function redactKeys(text: string): string {
  return text.replace(KEY_LIKE, (m) => `sk-ant-…${m.slice(-4)}`);
}
