// Deployment-time configuration. Split out because the answers differ by
// environment in ways the rest of the code shouldn't have to think about:
// locally everything is permissive, in production almost nothing is.

export const PORT = Number(process.env.PORT ?? 4000);

// Railway/Render/Fly all set NODE_ENV=production on a deployed build. Treated
// as the switch for every "is this public?" decision below, so there is one
// thing to get wrong rather than six.
export const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Origins allowed to create sessions and open sockets.
 *
 * Empty in development, which means "allow anything" — a comma-separated
 * RELAY_ALLOWED_ORIGINS is only worth maintaining once the server is reachable
 * from outside the machine that runs it.
 */
export const ALLOWED_ORIGINS: string[] = (process.env.RELAY_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

/**
 * Whether `origin` may talk to this server.
 *
 * A missing Origin header passes: that is the relayrun CLI, curl, and every
 * other non-browser client. Origin is a browser-enforced header, so treating
 * its absence as a rejection would lock out the one client that matters most
 * while stopping no attacker — anything scripted can send whatever it likes.
 * What this actually defends against is a random web page quietly opening
 * sockets against this server using a visitor's browser.
 */
export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.length === 0) return !IS_PRODUCTION;
  return ALLOWED_ORIGINS.includes(origin.replace(/\/$/, ""));
}

// Session creation is unauthenticated by design (the link is the capability),
// so the only thing standing between a public URL and unbounded memory growth
// is this. Per-IP rather than global: one noisy client shouldn't be able to
// lock everyone else out of creating a session.
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_SESSIONS = Number(
  process.env.RELAY_MAX_SESSIONS_PER_MINUTE ?? 10,
);

// A hard ceiling on concurrent in-memory sessions. Reaping already bounds
// growth under normal use; this bounds it under abuse, where sessions are
// created faster than the 10-minute reap can retire them.
export const MAX_LIVE_SESSIONS = Number(process.env.RELAY_MAX_LIVE_SESSIONS ?? 500);

// How long an empty, unhosted session stays resident before its record is
// dropped. Generous by default — someone might be mid-refresh — but tunable,
// because a small instance holding long transcripts is the first thing to feel
// it, and because a 10-minute timer is otherwise untestable.
export const REAP_MS = Number(process.env.RELAY_REAP_MS ?? 10 * 60_000);
