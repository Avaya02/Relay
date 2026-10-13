import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CanUseTool, Options } from "@anthropic-ai/claude-agent-sdk";

const run = promisify(execFile);

// Whoever drives can see the code through the agent anyway; the box guards the
// rest of the host's machine. Package registries only, so installs work but a
// run can't post anywhere else.
const ALLOWED_DOMAINS = [
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "pypi.org",
  "files.pythonhosted.org",
  "github.com",
  "*.github.com",
  "*.githubusercontent.com",
  "crates.io",
  "*.crates.io",
  "proxy.golang.org",
  "sum.golang.org",
  "rubygems.org",
];

// The sandbox can read most of the machine by default and ships no deny list,
// so every secret location has to be named.
const SECRET_PATHS = [
  "~/.ssh",
  "~/.aws",
  "~/.azure",
  "~/.gnupg",
  "~/.kube",
  "~/.docker",
  "~/.netrc",
  "~/.git-credentials",
  "~/.pypirc",
  // Holds npm publish tokens; a stolen one can ship a poisoned package.
  "~/.npmrc",
  "~/.gem/credentials",
  "~/.cargo/credentials",
  "~/.cargo/credentials.toml",
  "~/.config/gh",
  "~/.config/gcloud",
  "~/.claude/.credentials.json",
  "~/Library/Keychains",
  "~/Library/Cookies",
  "~/Library/Application Support/Google/Chrome",
  "~/Library/Application Support/Firefox",
  "~/.config/google-chrome",
  "~/.mozilla",
];

// Matched by name because the CLI inherits whatever the host exported in their
// shell. Claude Code itself keeps them: the API key helper reads one. Whole name
// parts only, so GIT_AUTHOR_NAME survives and AWS_ACCESS_KEY_ID doesn't.
export const SECRET_ENV =
  /(^|_)(api_?key|access_?key|private_?key|key|token|secret|passw(or)?d|pass|credentials?|auth|dsn|database_url|redis_url|mongo(db)?_ur[il])(_|$)/i;

// Caches default to the home directory, which the box won't let commands write,
// and inside the clone they'd show up as session changes and get published.
export function cacheDirFor(workingDir: string): string {
  return `${workingDir}.cache`;
}

function cacheEnv(cacheDir: string): Record<string, string> {
  return {
    npm_config_cache: `${cacheDir}/npm`,
    // npm and pnpm read ~/.npmrc on every run; it's denied above, so point them
    // at an empty one instead of letting them fail on it.
    npm_config_userconfig: `${cacheDir}/npmrc`,
    npm_config_store_dir: `${cacheDir}/pnpm`,
    YARN_CACHE_FOLDER: `${cacheDir}/yarn`,
    PIP_CACHE_DIR: `${cacheDir}/pip`,
    GOMODCACHE: `${cacheDir}/go/mod`,
    GOCACHE: `${cacheDir}/go/build`,
    XDG_CACHE_HOME: cacheDir,
  };
}

// Nobody is there to approve, so anything the box doesn't already allow is
// refused. Shell commands are the exception: Claude Code still asks about ones
// like `FOO=bar npm test`, but with unsandboxed retries off they run boxed anyway.
export const refuse: CanUseTool = async (toolName, input) => {
  if (toolName === "Bash" && input.dangerouslyDisableSandbox !== true) {
    return { behavior: "allow", updatedInput: input };
  }
  // Runs on Anthropic's side and touches nothing here. WebFetch stays refused:
  // it fetches from this machine, so it could reach the host's local network.
  if (toolName === "WebSearch") return { behavior: "allow", updatedInput: input };
  const target = String(input.file_path ?? input.path ?? input.url ?? input.command ?? "");
  console.log(`blocked: ${toolName} ${target}`.slice(0, 200));
  return {
    behavior: "deny",
    message:
      "Relay blocked this: the agent may only work inside the session's folder and reach package registries.",
  };
};

export function sandboxOptions(opts: {
  workingDir: string;
  sourcePath: string;
  allowDomains: string[];
}): Partial<Options> {
  const cacheDir = cacheDirFor(opts.workingDir);
  const secretEnv = Object.keys(process.env).filter((name) => SECRET_ENV.test(name));

  return {
    permissionMode: "acceptEdits",
    canUseTool: refuse,
    env: { ...process.env, ...cacheEnv(cacheDir) },
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: true,
      // Otherwise the agent can ask to re-run a blocked command outside the box.
      allowUnsandboxedCommands: false,
      failIfUnavailable: true,
      network: {
        allowedDomains: [...ALLOWED_DOMAINS, ...opts.allowDomains],
        strictAllowlist: true,
      },
      filesystem: {
        allowWrite: [cacheDir],
        // The host's own checkout holds the .env files the clone leaves out.
        denyRead: [...SECRET_PATHS, opts.sourcePath],
      },
      credentials: {
        envVars: secretEnv.map((name) => ({ name, mode: "deny" as const })),
      },
    },
  };
}

export type SandboxSupport = { ok: true } | { ok: false; help: string };

async function onPath(cmd: string): Promise<boolean> {
  try {
    await run("command", ["-v", cmd], { shell: true, timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

// Checked before the link is printed, so nobody joins a session that can't run.
export async function sandboxSupport(): Promise<SandboxSupport> {
  if (process.platform === "darwin") return { ok: true };
  if (process.platform === "linux") {
    const missing = [];
    if (!(await onPath("bwrap"))) missing.push("bubblewrap");
    if (!(await onPath("socat"))) missing.push("socat");
    if (missing.length === 0) return { ok: true };
    return {
      ok: false,
      help: `the agent's sandbox needs ${missing.join(" and ")} on Linux
     sudo apt-get install ${missing.join(" ")}     (Debian/Ubuntu)
     sudo dnf install ${missing.join(" ")}         (Fedora)`,
    };
  }
  return {
    ok: false,
    help: "the agent's sandbox needs macOS, Linux or WSL2; on Windows, run relayrun inside WSL2",
  };
}
