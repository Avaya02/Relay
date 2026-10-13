#!/usr/bin/env node
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { findClaudeLogin, hasClaudeCli, noLoginGuidance } from "./login.js";
import { createRepo } from "./repo.js";
import { startRunner } from "./runner.js";
import { sandboxSupport } from "./agent/sandbox.js";
import {
  apiKeyHelperPath,
  keyHint,
  looksLikeApiKey,
  SESSION_KEY_ENV,
  verifyApiKey,
} from "./sessionKey.js";

const run = promisify(execFile);

// Published defaults: the CLI runs on other people's machines, so localhost won't do.
const DEFAULT_SERVER = process.env.RELAY_SERVER ?? "https://api.relayrun.in";
const DEFAULT_WEB = process.env.RELAY_WEB ?? "https://relayrun.in";
const DEFAULT_MODEL = process.env.RELAY_MODEL ?? "claude-sonnet-5";

const USAGE = `relayrun — run a Relay session against a repository on this machine

  relayrun [options]

  --repo <path>          Repository to work in (default: current directory)
  --server <url>         Relay coordination server (default: ${DEFAULT_SERVER})
  --web <url>            Web app, for the printed link (default: ${DEFAULT_WEB})
  --mock                 Run the scripted offline agent instead of a real one.
                         Costs nothing, but ignores what you type and replays
                         a fixed script. For UI work, not for real answers.
  --api-key <key>        Bill runs to this key instead of your Claude Code login
  --model <id>           Model to run (default: ${DEFAULT_MODEL})
  --session <id>         Reattach to an existing session (requires --token)
  --token <token>        Runner token for --session
  --github-repo <o/n>    Open a PR here on publish
  --github-token <tok>   Token for --github-repo
  --allow-domain <list>  Extra hosts the agent's commands may reach, comma-separated
  --no-sandbox           Run the agent unboxed, with full access to this machine.
                         Only for sessions where you trust everyone with the link
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

// `git clone` needs the root; from a subdirectory the rev-parse check passed
// and the clone failed later.
async function repoRoot(dir: string): Promise<string> {
  try {
    const { stdout } = await run("git", ["rev-parse", "--show-toplevel"], { cwd: dir });
    return stdout.trim();
  } catch {
    throw new Error(`not a git repository: ${dir}`);
  }
}

// Retried because `pnpm dev` starts every package at once, so the server is
// often still binding its port.
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

async function resolveCredentials(args: Args): Promise<Credentials> {
  // The mock ignores instructions and replays a fixed script, so getting it by
  // accident is worse than a stray real run; it must be asked for by name.
  if (args.mock) return { mode: "mock", keySource: "mock", keyHint: null };

  const key = str(args, "api-key") ?? process.env.RELAY_API_KEY;
  if (!key) {
    // Fail before the link is printed and shared, not on the first instruction.
    if ((await findClaudeLogin()) === "missing") {
      throw new Error(noLoginGuidance(await hasClaudeCli()));
    }
    return { mode: "real", keySource: "oauth", keyHint: null };
  }

  if (!looksLikeApiKey(key)) {
    throw new Error("that doesn't look like an Anthropic API key (expected sk-ant-…)");
  }
  const check = await verifyApiKey(key);
  if (!check.ok) throw new Error(check.error);

  const helper = apiKeyHelperPath();
  if (!helper) {
    // Falling back to the host's login would bill the wrong account.
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

  const boxed = credentials.mode === "real" && !args["no-sandbox"];
  if (boxed) {
    const support = await sandboxSupport();
    if (!support.ok) {
      throw new Error(`${support.help}\n\n     Or start with --no-sandbox if you trust everyone you share the link with.`);
    }
  }

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
  console.log(`  shared   transcript only — code, keys and files stay on this machine`);
  if (credentials.mode === "real") {
    console.log(
      boxed
        ? `  sandbox  on — commands can't read your keys or write outside the session folder`
        : `  sandbox  OFF — whoever drives can run anything on this machine as you`,
    );
  }
  console.log(`\n  Share this link:\n    ${new URL(`/session/${id}`, webUrl)}\n`);
  if (!existing) {
    console.log(`  To reattach after a restart:\n    relayrun --session ${id} --token ${runnerToken}\n`);
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
    model: str(args, "model") ?? DEFAULT_MODEL,
    sandbox: boxed
      ? {
          sourcePath,
          allowDomains: (str(args, "allow-domain") ?? "")
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean),
        }
      : null,
  });
}

main().catch((err) => {
  console.error(`\n  ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
