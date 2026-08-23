import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// MAKING A SESSION-SUPPLIED KEY ACTUALLY BE THE ONE THAT'S USED.
//
// This exists because the obvious implementation is silently wrong. Passing
// `env: { ...process.env, ANTHROPIC_API_KEY: key }` to the SDK looks like it
// supplies the key, typechecks, and produces a successful run — but on any
// machine where the operator has logged into Claude Code, the subprocess
// ignores the variable and authenticates with the operator's stored OAuth
// token instead. Verified by pointing ANTHROPIC_BASE_URL at a local server
// and reading the headers: every request carried `Authorization: Bearer
// sk-ant-oat...`, the host's credential, with the supplied key nowhere.
//
// That is the worst possible failure for this feature. The UI would tell a
// user their key was in use and their account was being billed, while the
// host silently paid for it — and routing other people's requests through a
// subscription credential is exactly what Anthropic's terms prohibit.
//
// `apiKeyHelper` is the mechanism that does work. It's a script the CLI runs
// to obtain a credential, and its output is sent as `x-api-key`, taking
// precedence over the stored OAuth token.
//
// The script deliberately contains no secret. It echoes an environment
// variable, and the key travels in the subprocess environment exactly as
// before — so "held in memory for this session, never written to disk"
// remains true, which matters because the UI says so.

/** The env var the helper reads. Must match what agent.ts sets. */
export const SESSION_KEY_ENV = "RELAY_SESSION_API_KEY";

const SCRIPT = `#!/bin/sh\nprintf %s "$${SESSION_KEY_ENV}"\n`;

let helperPath: string | null = null;

/**
 * Path to the helper script, created once per process on first use.
 *
 * Returns null if it can't be created (read-only tmp, a platform without
 * /bin/sh). The caller falls back to running the mock rather than starting a
 * run that would quietly bill the wrong account — a feature that doesn't work
 * is recoverable, one that charges the wrong person is not.
 */
export function apiKeyHelperPath(): string | null {
  if (helperPath) return helperPath;
  try {
    // 0700 on both the directory and the script: it's executed by a
    // subprocess of this process and nothing else needs to read it.
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

// --- verification ---------------------------------------------------------
//
// A key is checked the moment it's supplied, not the first time it's used.
//
// Without this, a mistyped or revoked key is accepted silently, and the
// person only finds out when they send an instruction: the agent retries the
// 401 with backoff for over three minutes and then reports the failure as its
// answer. Measured — 191 seconds from instruction to "Failed to authenticate".
// One request up front turns that into an immediate, accurate "no".
//
// `/v1/models` is the cheapest authenticated endpoint there is: it lists
// models, costs nothing, and answers the only question being asked — does
// this credential work.

const VERIFY_TIMEOUT_MS = 10_000;

export type KeyCheck = { ok: true } | { ok: false; error: string };

export async function verifyApiKey(key: string): Promise<KeyCheck> {
  // Honours a gateway/proxy base URL if the host runs one, so verification
  // and the agent itself talk to the same place.
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
      // The key is real — it's the account that's over its limit. Accepting
      // it is right: the rate limit may well have cleared by the first run.
      return { ok: true };
    }
    return {
      ok: false,
      error: `could not verify that key (Anthropic returned ${res.status})`,
    };
  } catch {
    // Offline, DNS failure, or the timeout above. Refuse rather than accept
    // optimistically: if the server can't reach Anthropic now, the agent
    // can't either, and a key accepted here would fail confusingly later.
    return { ok: false, error: "could not reach Anthropic to check that key" };
  }
}
