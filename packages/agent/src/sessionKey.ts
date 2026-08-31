import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * MAKING AN EXPLICITLY SUPPLIED KEY ACTUALLY BE THE ONE THAT'S USED.
 *
 * This exists because the obvious implementation is silently wrong. Passing
 * `env: { ANTHROPIC_API_KEY: key }` to the SDK looks like it supplies the key,
 * typechecks, and produces a successful run — but on any machine where the
 * operator has logged into Claude Code, the subprocess ignores the variable and
 * authenticates with their stored OAuth token instead. Verified by pointing
 * ANTHROPIC_BASE_URL at a local server and reading the headers: every request
 * carried `Authorization: Bearer sk-ant-oat...`, the operator's own credential,
 * with the supplied key nowhere.
 *
 * `apiKeyHelper` is the mechanism that does work. It's a script the CLI runs to
 * obtain a credential, and its output is sent as `x-api-key`, taking precedence
 * over the stored OAuth token.
 *
 * The script deliberately contains no secret. It echoes an environment
 * variable, and the key travels in the process environment exactly as before.
 */

/** The env var the helper reads. Must match what the runner sets. */
export const SESSION_KEY_ENV = "RELAY_SESSION_API_KEY";

const SCRIPT = `#!/bin/sh\nprintf %s "$${SESSION_KEY_ENV}"\n`;

let helperPath: string | null = null;

/**
 * Path to the helper script, created once per process on first use. Returns
 * null if it can't be created (read-only tmp, a platform without /bin/sh).
 */
export function apiKeyHelperPath(): string | null {
  if (helperPath) return helperPath;
  try {
    // 0700 on both the directory and the script: it's executed by a subprocess
    // of this process and nothing else needs to read it.
    const dir = mkdtempSync(path.join(tmpdir(), "relay-key-"));
    chmodSync(dir, 0o700);
    const file = path.join(dir, "relay-api-key");
    writeFileSync(file, SCRIPT, { mode: 0o700 });
    chmodSync(file, 0o700);

    process.once("exit", () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best effort — it holds no secret, and tmp is cleared on reboot.
      }
    });

    helperPath = file;
    return helperPath;
  } catch (err) {
    console.error(
      "could not create the API key helper:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

const VERIFY_TIMEOUT_MS = 10_000;

export type KeyCheck = { ok: true } | { ok: false; error: string };

/**
 * Checks a key at startup rather than on first use.
 *
 * Without this, a mistyped or revoked key is accepted silently and the operator
 * finds out only when an instruction arrives: the agent retries the 401 with
 * backoff for over three minutes, then reports the failure as its answer.
 * Measured — 191 seconds from instruction to "Failed to authenticate". One
 * request up front turns that into an immediate, accurate "no".
 *
 * `/v1/models` is the cheapest authenticated endpoint there is.
 */
export async function verifyApiKey(key: string): Promise<KeyCheck> {
  const base = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/v1/models?limit=1`, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });

    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Anthropic rejected that key" };
    }
    if (res.status === 429) {
      // The key is real — it's the account that's over its limit. Accepting it
      // is right: the rate limit may well have cleared by the first run.
      return { ok: true };
    }
    return {
      ok: false,
      error: `could not verify that key (Anthropic returned ${res.status})`,
    };
  } catch {
    // Offline, DNS failure, or the timeout above. Refuse rather than accept
    // optimistically: if this machine can't reach Anthropic now, the agent
    // can't either, and a key accepted here would fail confusingly later.
    return { ok: false, error: "could not reach Anthropic to check that key" };
  }
}

const KEY_SHAPE = /^[A-Za-z0-9_-]+$/;
const MAX_KEY_LENGTH = 300;

/** Shape-only check, so an obviously malformed key fails before a network call. */
export function looksLikeApiKey(key: string): boolean {
  return (
    key.startsWith("sk-ant-") && key.length <= MAX_KEY_LENGTH && KEY_SHAPE.test(key)
  );
}

/** The only part of a key that may leave this machine. */
export function keyHint(key: string): string {
  return key.slice(-4);
}
