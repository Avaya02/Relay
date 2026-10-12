import { RATE_LIMIT_MAX_SESSIONS, RATE_LIMIT_WINDOW_MS } from "./config.js";

// Fixed window on purpose: a 2x burst at a boundary is tolerable here. In-memory,
// so only correct for a single process, like all session state.
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX_SESSIONS;
}

// Otherwise the map grows one entry per distinct IP forever.
const SWEEP_MS = 5 * 60_000;
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now >= entry.resetAt) hits.delete(key);
  }
}, SWEEP_MS);
sweep.unref();

// Behind a proxy remoteAddress is the proxy's, so use the leftmost x-forwarded-for.
// Spoofable, but that can only evade the limit, never get someone else limited.
export function clientKey(
  headers: Record<string, string | string[] | undefined>,
  fallback: string | undefined,
): string {
  const forwarded = headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(",")[0]?.trim();
  return first || fallback || "unknown";
}
