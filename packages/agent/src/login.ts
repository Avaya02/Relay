import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

// "unknown" (unreadable credential store) must not block the run.
export type LoginCheck = "found" | "missing" | "unknown";

// Existence check only: `security` prints the secret just for -w, which we never
// pass, so the secret is never read.
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

export async function hasClaudeCli(): Promise<boolean> {
  try {
    await run("command", ["-v", "claude"], { shell: true, timeout: PROBE_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

// Line one is unindented because the caller's error handler indents it.
// No login link: the CLI must start the OAuth flow itself.
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
