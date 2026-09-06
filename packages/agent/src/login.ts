import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Whether this machine has a Claude Code login for the SDK to authenticate with.
 *
 * "unknown" is not a failure. It is a platform whose credential store this
 * cannot read, and the run is allowed to proceed: blocking someone whose setup
 * merely can't be inspected would be a worse bug than the late failure this
 * exists to prevent.
 */
export type LoginCheck = "found" | "missing" | "unknown";

// Probed for existence only. `security` prints the secret itself just for -w,
// which is deliberately not passed — nothing here needs the credential, only
// the knowledge that one exists.
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const PROBE_TIMEOUT_MS = 5_000;

export async function findClaudeLogin(): Promise<LoginCheck> {
  if (process.platform === "darwin") {
    try {
      await run("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE], {
        timeout: PROBE_TIMEOUT_MS,
      });
      return "found";
    } catch {
      return "missing";
    }
  }

  if (process.platform === "linux") {
    return existsSync(path.join(homedir(), ".claude", ".credentials.json"))
      ? "found"
      : "missing";
  }

  return "unknown";
}

/** Whether the Claude Code CLI is on PATH, so the advice can skip an install step. */
export async function hasClaudeCli(): Promise<boolean> {
  try {
    await run("command", ["-v", "claude"], { shell: true, timeout: PROBE_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

/**
 * Printed instead of a session link when no credential is found.
 *
 * Line one carries no indent because the caller's error handler adds it; the
 * rest is indented here.
 *
 * Two variants because the install step is noise for the many people who
 * already have the CLI and simply are not signed in — telling them to install
 * something they have reads as advice that hasn't looked at their machine.
 *
 * There is deliberately no "click here to log in" link: the sign-in is an
 * OAuth flow the CLI has to start itself, since it generates the challenge and
 * receives the callback that writes the credential. No static URL can do it.
 */
export function noLoginGuidance(cliInstalled: boolean): string {
  const signIn = cliInstalled
    ? `     1  Sign in to Claude Code                              (recommended)
          claude              → sign in, then re-run relayrun
          The CLI is already installed here — it just isn't signed in.`
    : `     1  Install and sign in to Claude Code                  (recommended)
          npm i -g @anthropic-ai/claude-code
          claude              → sign in, then re-run relayrun
          Setup guide: https://docs.claude.com/en/docs/claude-code/setup`;

  return `No Claude credential found on this machine

     relayrun ships no credentials of its own. It runs Claude on your machine,
     with your access, billed to your account — so it needs one of these first:

${signIn}

     2  Use an Anthropic API key
          relayrun --api-key sk-ant-...
          Create one at https://console.anthropic.com/settings/keys

     3  See how it works without spending anything
          relayrun --mock     → scripted demo, ignores your instructions

     Signing in through the Claude Code VS Code extension works too — it shares
     the same credential. A claude.ai browser session or the Claude Desktop app
     does not.`;
}
