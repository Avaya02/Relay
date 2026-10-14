import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CanUseTool, Options } from "@anthropic-ai/claude-agent-sdk";

const run = promisify(execFile);

// Registries only: installs work, but a run can't send data anywhere else.
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

// The sandbox reads most of the machine by default, so secrets must be named.
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

// Whole name parts, so GIT_AUTHOR_NAME stays visible and AWS_ACCESS_KEY_ID doesn't.
export const SECRET_ENV =
  /(^|_)(api_?key|access_?key|private_?key|key|token|secret|passw(or)?d|pass|credentials?|auth|dsn|database_url|redis_url|mongo(db)?_ur[il])(_|$)/i;

// Outside the clone, or caches would show up as session changes.
export function cacheDirFor(workingDir: string): string {
  return `${workingDir}.cache`;
}

function cacheEnv(cacheDir: string): Record<string, string> {
  return {
    npm_config_cache: `${cacheDir}/npm`,
    // ~/.npmrc is denied; without this npm fails trying to read it.
    npm_config_userconfig: `${cacheDir}/npmrc`,
    npm_config_store_dir: `${cacheDir}/pnpm`,
    YARN_CACHE_FOLDER: `${cacheDir}/yarn`,
    PIP_CACHE_DIR: `${cacheDir}/pip`,
    GOMODCACHE: `${cacheDir}/go/mod`,
    GOCACHE: `${cacheDir}/go/build`,
    XDG_CACHE_HOME: cacheDir,
  };
}

// No one is there to approve. Shell commands still run boxed, so they pass.
export const refuse: CanUseTool = async (toolName, input) => {
  if (toolName === "Bash" && input.dangerouslyDisableSandbox !== true) {
    return { behavior: "allow", updatedInput: input };
  }
  // Runs on Anthropic's side; WebFetch stays refused since it can reach the local network.
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
      allowUnsandboxedCommands: false,
      network: {
        allowedDomains: [...ALLOWED_DOMAINS, ...opts.allowDomains],
        strictAllowlist: true,
      },
      filesystem: {
        allowWrite: [cacheDir],
        // The original checkout holds the .env files the clone leaves out.
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

export async function sandboxSupport(): Promise<SandboxSupport> {
  if (process.platform === "darwin") return { ok: true };
  if (process.platform === "linux") {
    const missing = [];
    if (!(await onPath("bwrap"))) missing.push("bubblewrap");
    if (!(await onPath("socat"))) missing.push("socat");
    if (missing.length === 0) return { ok: true };
    return {
      ok: false,
      help: `the agent's sandbox needs ${missing.join(" and ")}: sudo apt-get install ${missing.join(" ")}`,
    };
  }
  return { ok: false, help: "the agent's sandbox needs macOS, Linux or WSL2" };
}
