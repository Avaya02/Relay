export const PORT = Number(process.env.PORT ?? 4000);

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Empty means allow anything outside production (see originAllowed).
export const ALLOWED_ORIGINS: string[] = (process.env.RELAY_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

// A missing Origin passes: that's the CLI, and non-browser clients can forge it
// anyway. This only stops other web pages using a visitor's browser against us.
export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.length === 0) return !IS_PRODUCTION;
  return ALLOWED_ORIGINS.includes(origin.replace(/\/$/, ""));
}

// Per-IP, so one noisy client can't lock everyone else out.
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_SESSIONS = Number(
  process.env.RELAY_MAX_SESSIONS_PER_MINUTE ?? 10,
);

// Bounds memory when sessions are created faster than the reap retires them.
export const MAX_LIVE_SESSIONS = Number(process.env.RELAY_MAX_LIVE_SESSIONS ?? 500);

// Tunable so the 10-minute default can be shortened in tests.
export const REAP_MS = Number(process.env.RELAY_REAP_MS ?? 10 * 60_000);
