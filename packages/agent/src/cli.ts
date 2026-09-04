#!/usr/bin/env node
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { createRepo } from "./repo.js";
import { startRunner } from "./runner.js";
import {
  apiKeyHelperPath,
  keyHint,
  looksLikeApiKey,
  SESSION_KEY_ENV,
  verifyApiKey,
} from "./sessionKey.js";

const run = promisify(execFile);

/**
 * Where a published build points when given no `--server`/`--web`.
 *
 * These are the two values to change after deploying, and the only ones — the
 * CLI is installed on other people's machines, so "it works if you also run the
 * server locally" is not a default anyone else can use. Env vars override them
 * so a contributor can point at a scratch deployment without editing source.
 */
const DEFAULT_SERVER = process.env.RELAY_SERVER ?? "https://relay-production-c9bd.up.railway.app";
const DEFAULT_WEB = process.env.RELAY_WEB ?? "https://relay-web-green.vercel.app";

const USAGE = `relayd — run a Relay session against a repository on this machine

  relayd [options]

  --repo <path>          Repository to work in (default: current directory)
  --server <url>         Relay coordination server (default: ${DEFAULT_SERVER})
  --web <url>            Web app, for the printed link (default: ${DEFAULT_WEB})
  --mock                 Run the scripted offline agent instead of a real one.
                         Costs nothing, but ignores what you type and replays
                         a fixed script. For UI work, not for real answers.
  --api-key <key>        Bill runs to this key instead of your Claude Code login
  --session <id>         Reattach to an existing session (requires --token)
  --token <token>        Runner token for --session
  --github-repo <o/n>    Open a PR here on publish
  --github-token <tok>   Token for --github-repo
  -h, --help             Show this message
`;

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      if (arg === "-h") args.help = true;
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    // A flag is boolean unless the next token is a value rather than a flag.
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function str(args: Args, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}

function wsUrlFor(serverUrl: string, sessionId: string): string {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("session", sessionId);
  return url.toString();
}

/**
 * The root of the repository containing `dir`.
 *
 * Resolved rather than used as given: `git rev-parse` succeeds from anywhere
 * inside a repo, but `git clone` needs the root. Running the CLI from a
 * subdirectory therefore passed the check and then failed at clone time — and
 * a subdirectory is the normal case, since people run this from wherever they
 * happen to be. Taking the root also means the session gets the whole
 * repository, which is what someone naming their project means.
 */
async function repoRoot(dir: string): Promise<string> {
  try {
    const { stdout } = await run("git", ["rev-parse", "--show-toplevel"], { cwd: dir });
    return stdout.trim();
  } catch {
    throw new Error(`not a git repository: ${dir}`);
  }
}

/**
 * Mints a session and the token that proves this process owns it.
 *
 * Retried: `pnpm dev` starts every package at once, so the server is routinely
 * still binding its port when this runs.
 */
async function createSession(
  serverUrl: string,
): Promise<{ id: string; runnerToken: string }> {
  const attempts = 10;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(new URL("/sessions", serverUrl), { method: "POST" });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      return (await res.json()) as { id: string; runnerToken: string };
    } catch (err) {
      if (i === attempts - 1) {
        throw new Error(
          `could not reach the Relay server at ${serverUrl} — is it running? (${
            err instanceof Error ? err.message : err
          })`,
        );
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
  throw new Error("unreachable");
}

type Credentials = {
  mode: "mock" | "real";
  keySource: "oauth" | "api-key" | "mock";
  keyHint: string | null;
  apiKeyHelper?: string;
};

/**
 * Resolves what the run will be billed to, before connecting — a key that turns
 * out to be bad should fail here, not three minutes into someone's session.
 */
async function resolveCredentials(args: Args): Promise<Credentials> {
  // Real is the default. The scripted agent ignores whatever you type and
  // replays a fixed script, so getting it by accident means watching a
  // convincing answer to a question you never asked. That failure is worse
  // than the pennies an unwanted real run costs — ask for the mock by name.
  if (args.mock) return { mode: "mock", keySource: "mock", keyHint: null };

  const key = str(args, "api-key") ?? process.env.RELAY_API_KEY;
  if (!key) {
    // No explicit key: the SDK uses whatever this machine is already logged in
    // with, exactly as Claude Code does.
    return { mode: "real", keySource: "oauth", keyHint: null };
  }

  if (!looksLikeApiKey(key)) {
    throw new Error("that doesn't look like an Anthropic API key (expected sk-ant-…)");
  }
  const check = await verifyApiKey(key);
  if (!check.ok) throw new Error(check.error);

  const helper = apiKeyHelperPath();
  if (!helper) {
    // Falling back to the operator's own login would bill the wrong account
    // behind a UI saying otherwise — refuse instead.
    throw new Error("could not create the API key helper, so --api-key can't be honoured");
  }
  process.env[SESSION_KEY_ENV] = key;
  return { mode: "real", keySource: "api-key", keyHint: keyHint(key), apiKeyHelper: helper };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const serverUrl = str(args, "server") ?? DEFAULT_SERVER;
  const webUrl = str(args, "web") ?? DEFAULT_WEB;

  const sourcePath = await repoRoot(path.resolve(str(args, "repo") ?? process.cwd()));
  const credentials = await resolveCredentials(args);

  const existing = str(args, "session");
  const existingToken = str(args, "token");
  if (existing && !existingToken) {
    throw new Error("--session also needs --token (printed when the session was created)");
  }

  const { id, runnerToken } =
    existing && existingToken
      ? { id: existing, runnerToken: existingToken }
      : await createSession(serverUrl);

  const repo = createRepo({
    sourcePath,
    githubRepo: str(args, "github-repo") ?? process.env.RELAY_GITHUB_REPO ?? null,
    githubToken: str(args, "github-token") ?? process.env.RELAY_GITHUB_TOKEN ?? null,
  });

  const billing =
    credentials.mode === "mock"
      ? "SCRIPTED MOCK — ignores your instructions, answers are fake"
      : credentials.keySource === "api-key"
        ? `real agent — billed to the key ending ${credentials.keyHint}`
        : "real agent — billed to this machine's Claude Code login";

  console.log(`\n  repo     ${path.basename(sourcePath)}  (${sourcePath})`);
  console.log(`  agent    ${billing}`);
  console.log(`  session  ${id}`);
  console.log(`\n  Share this link:\n    ${new URL(`/session/${id}`, webUrl)}\n`);
  if (!existing) {
    console.log(`  To reattach after a restart:\n    relayd --session ${id} --token ${runnerToken}\n`);
  }

  startRunner({
    wsUrl: wsUrlFor(serverUrl, id),
    sessionId: id,
    token: runnerToken,
    repo,
    mode: credentials.mode,
    keySource: credentials.keySource,
    keyHint: credentials.keyHint,
    apiKeyHelper: credentials.apiKeyHelper,
  });
}

main().catch((err) => {
  console.error(`\n  ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
