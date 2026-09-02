import { RATE_LIMIT_MAX_SESSIONS, RATE_LIMIT_WINDOW_MS } from "./config.js";

// Fixed-window counter, in memory. Deliberately not a sliding window or a
// token bucket: this guards one unauthenticated endpoint on a single-process
// server, and a burst of at most 2x the limit across a window boundary is not
// a failure mode worth extra machinery. If the server ever runs more than one
// process, this stops being correct — and so does everything else about
// session state, so it fails at the same time as the rest.
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

// Without this the map grows one entry per distinct IP, forever — the exact
// leak the rate limiter exists to prevent, just moved somewhere quieter.
const SWEEP_MS = 5 * 60_000;
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now >= entry.resetAt) hits.delete(key);
  }
}, SWEEP_MS);
sweep.unref();

/**
 * The client address to rate-limit against.
 *
 * Railway, Render and Fly all terminate TLS at a proxy, so `socket.remoteAddress`
 * is the proxy's and identical for every caller — limiting on it would throttle
 * the whole internet as one client. The leftmost x-forwarded-for entry is the
 * original caller. It is trivially spoofable, which is fine here: the header can only
 * be used to *evade* the limit, never to get someone else limited, because a
 * forged value simply creates a new bucket.
 */
export function clientKey(
  headers: Record<string, string | string[] | undefined>,
  fallback: string | undefined,
): string {
  const forwarded = headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(",")[0]?.trim();
  return first || fallback || "unknown";
}
