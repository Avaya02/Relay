import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// apiKeyHelper rather than ANTHROPIC_API_KEY in env: the env var was ignored when a
// Claude Code login existed, so the stored OAuth account got billed. The script holds no secret.
export const SESSION_KEY_ENV = "RELAY_SESSION_API_KEY";

const SCRIPT = `#!/bin/sh\nprintf %s "$${SESSION_KEY_ENV}"\n`;

let helperPath: string | null = null;

export function apiKeyHelperPath(): string | null {
  if (helperPath) return helperPath;
  try {
    // 0700: only this process's SDK subprocess should be able to run it.
    const dir = mkdtempSync(path.join(tmpdir(), "relay-key-"));
    chmodSync(dir, 0o700);
    const file = path.join(dir, "relay-api-key");
    writeFileSync(file, SCRIPT, { mode: 0o700 });
    chmodSync(file, 0o700);

    process.once("exit", () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best effort; the script holds no secret.
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

// Checked at startup because a bad key otherwise took ~191s of 401 retries to fail.
// /v1/models is the cheapest authenticated endpoint.
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
      // The key is real; the account is just rate-limited.
      return { ok: true };
    }
    return {
      ok: false,
      error: `could not verify that key (Anthropic returned ${res.status})`,
    };
  } catch {
    // If this machine can't reach Anthropic now, the agent can't either.
    return { ok: false, error: "could not reach Anthropic to check that key" };
  }
}

const KEY_SHAPE = /^[A-Za-z0-9_-]+$/;
const MAX_KEY_LENGTH = 300;

export function looksLikeApiKey(key: string): boolean {
  return (
    key.startsWith("sk-ant-") && key.length <= MAX_KEY_LENGTH && KEY_SHAPE.test(key)
  );
}

/** The only part of a key that may leave this machine. */
export function keyHint(key: string): string {
  return key.slice(-4);
}
