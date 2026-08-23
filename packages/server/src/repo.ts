import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

// The user's real project. This path is READ-ONLY as far as this server is
// concerned: it is only ever the `git clone` *source*. The agent's cwd is
// never set to it — see workingDirFor() below. Nothing here writes to it.
//
// Read inside ensurePristine(), not as a module-level const: ESM evaluates a
// module's imports before its own top-level code runs, so a .env loaded by
// index.ts's process.loadEnvFile() would resolve too late for a frozen
// const here to see it.
function sourceRepo(): string {
  return process.env.RELAY_SOURCE_REPO ?? "/Applications/Projects/PromptGuard";
}

// Just the folder name, for the session header. A watcher needs to know
// which codebase they're watching an agent edit; the full server-side path
// is both noise and a needless disclosure of the host's directory layout.
export function repoName(): string | null {
  const base = path.basename(sourceRepo());
  return base || null;
}

// Server-managed scratch space (gitignored). PRISTINE_DIR is cloned once and
// then only reset; each session gets its own disposable copy under SESSIONS_DIR.
const SERVER_ROOT = path.resolve(import.meta.dirname, "..");
const PRISTINE_DIR = path.join(SERVER_ROOT, ".demo-repo");
const SESSIONS_DIR = path.join(SERVER_ROOT, ".sessions");

let pristineReady: Promise<void> | null = null;

// Clone once, lazily. `git clone` copies committed state only — no node_modules,
// no .DS_Store, and (deliberately) none of the source repo's uncommitted work.
async function ensurePristine(): Promise<void> {
  if (existsSync(PRISTINE_DIR)) return;
  await mkdir(path.dirname(PRISTINE_DIR), { recursive: true });
  await run("git", ["clone", sourceRepo(), PRISTINE_DIR]);
}

function ensurePristineOnce(): Promise<void> {
  pristineReady ??= ensurePristine();
  return pristineReady;
}

// Per-session working dir: a clone of the pristine copy, so a session can edit
// and commit freely without touching the pristine tree (let alone the source).
export async function prepareWorkingDir(sessionId: string): Promise<string> {
  await ensurePristineOnce();
  const dir = path.join(SESSIONS_DIR, sessionId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(SESSIONS_DIR, { recursive: true });
  await run("git", ["clone", PRISTINE_DIR, dir]);
  return dir;
}

export async function disposeWorkingDir(sessionId: string): Promise<void> {
  const dir = path.join(SESSIONS_DIR, sessionId);
  await rm(dir, { recursive: true, force: true });
  // Otherwise repoLocks accumulates one entry per session for the life of
  // the process — nothing else ever removes a directory's key once it's
  // been queued on.
  repoLocks.delete(dir);
}

// Spec §6.6's reset, for reusing a working dir in place rather than recloning.
export async function resetWorkingDir(dir: string): Promise<void> {
  await run("git", ["reset", "--hard"], { cwd: dir });
  await run("git", ["clean", "-fd"], { cwd: dir });
}

// --- Session output -------------------------------------------------------
// A session's whole point is that the agent changed something. Until now that
// work evaporated when the working dir was disposed. These read it back out.

export type ChangedFile = {
  path: string;
  insertions: number;
  deletions: number;
};

export type SessionChanges = {
  files: ChangedFile[];
  insertions: number;
  deletions: number;
  patch: string;
};

// Cap the patch we ship to browsers. A runaway agent that rewrites a lockfile
// shouldn't push a multi-MB string down every participant's socket.
const MAX_PATCH_BYTES = 400_000;

// Serializes git operations per working directory.
//
// `sessionChanges` and `publishSession` both run a sequence of raw git
// commands against a session's clone, and both are reachable from more than
// one caller at once in the ordinary course of things: two participants
// joining within the same second each trigger a `request_changes`
// (useSession.ts requests it on `history`, so every joiner does), and a
// publish can land while a watcher's request is still in flight. Without
// this, concurrent `git add -A` calls collide on `.git/index.lock` — caught
// live while generating screenshots against a two-participant session,
// where it surfaced as `session_changes` failing outright.
//
// A promise-chain per directory rather than a real mutex library: the only
// property needed is "the next operation on this dir waits for the last
// one", and a chain gives that in a few lines. The tail is dropped once
// nothing is queued behind it, so this never accumulates memory for
// sessions that finish.
const repoLocks = new Map<string, Promise<unknown>>();

// The map entry is cleared by disposeWorkingDir, not here — clearing it as
// soon as one caller's turn ends would let two callers race again if a
// second one queued in the meantime but arrived a tick late.
function withRepoLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prior = repoLocks.get(dir) ?? Promise.resolve();
  // Chained even through a rejection: the operation ahead of this one
  // failing must not wedge every later caller on this directory.
  const run = prior.catch(() => {}).then(fn);
  repoLocks.set(dir, run.catch(() => {}));
  return run;
}

// Everything the agent touched this session, relative to the clone's starting
// commit. Staging first is what makes new files (the common case — the agent
// writes REPORT.md) show up at all; `git diff` alone ignores untracked paths.
// The working dir is disposable, so leaving things staged costs nothing.
//
// Unlocked core: `publishSession` needs to call this from *inside* its own
// lock (it computes changes as its first step), and the lock isn't
// reentrant — taking it twice from the same call stack would deadlock.
async function computeSessionChanges(dir: string): Promise<SessionChanges> {
  await run("git", ["add", "-A"], { cwd: dir });

  const { stdout: numstat } = await run(
    "git",
    ["diff", "--cached", "--numstat"],
    { cwd: dir, maxBuffer: 32 * 1024 * 1024 },
  );

  const files: ChangedFile[] = [];
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const [ins, del, ...rest] = line.split("\t");
    files.push({
      path: rest.join("\t"),
      // Binary files report "-" rather than a count.
      insertions: ins === "-" ? 0 : Number(ins) || 0,
      deletions: del === "-" ? 0 : Number(del) || 0,
    });
  }

  const { stdout: rawPatch } = await run("git", ["diff", "--cached"], {
    cwd: dir,
    maxBuffer: 32 * 1024 * 1024,
  });
  const patch =
    Buffer.byteLength(rawPatch) > MAX_PATCH_BYTES
      ? `${rawPatch.slice(0, MAX_PATCH_BYTES)}\n\n… patch truncated — ${files.length} files changed in total.`
      : rawPatch;

  return {
    files,
    insertions: files.reduce((n, f) => n + f.insertions, 0),
    deletions: files.reduce((n, f) => n + f.deletions, 0),
    patch,
  };
}

// Public entry point: queued behind anything else already running against
// this directory (see withRepoLock above).
export function sessionChanges(dir: string): Promise<SessionChanges> {
  return withRepoLock(dir, () => computeSessionChanges(dir));
}

export type PublishResult =
  | {
      ok: true;
      branch: string;
      pushed: boolean;
      prUrl: string | null;
      /** Set when the branch landed but the PR step didn't. */
      note?: string;
    }
  | { ok: false; error: string };

// Where a published branch goes. Both are optional: with neither set, a
// session still commits locally and reports the branch name, which is the
// useful part that needs no setup. The token is read from the server env and
// never leaves it.
function githubRepo(): string | null {
  return process.env.RELAY_GITHUB_REPO ?? null; // "owner/name"
}
function githubToken(): string | null {
  return process.env.RELAY_GITHUB_TOKEN ?? null;
}

// Commit the session's work to a branch, and — only if a repo and a
// least-privilege token are configured — push it and open a pull request.
export function publishSession(
  dir: string,
  sessionId: string,
  message: string,
): Promise<PublishResult> {
  // The whole sequence — measuring changes, checkout, commit, push — is one
  // queued unit. Calls computeSessionChanges directly rather than the
  // exported sessionChanges: that one takes this same lock, and taking it
  // twice from inside itself would deadlock.
  return withRepoLock(dir, () => doPublish(dir, sessionId, message));
}

async function doPublish(
  dir: string,
  sessionId: string,
  message: string,
): Promise<PublishResult> {
  const branch = `relay/session-${sessionId}`;

  try {
    const changes = await computeSessionChanges(dir);
    if (changes.files.length === 0) {
      return { ok: false, error: "nothing to publish — no files changed" };
    }

    await run("git", ["checkout", "-B", branch], { cwd: dir });
    // Identity is per-clone and disposable; without it `git commit` fails on
    // machines that have no global user.email configured.
    await run("git", ["-c", "user.email=relay@localhost", "-c", "user.name=Relay", "commit", "-m", message], { cwd: dir });

    // Always land the branch somewhere that outlives the session. The clone
    // is deleted when the last participant leaves, so a commit that only
    // exists there is gone within seconds of the run finishing. `origin` is
    // the pristine mirror (see prepareWorkingDir), which persists — and the
    // branch name is unique per session, so this never touches the mirror's
    // checked-out branch.
    await run("git", ["push", "--force", "origin", `HEAD:${branch}`], { cwd: dir });

    const repo = githubRepo();
    const token = githubToken();
    if (!repo || !token) {
      return { ok: true, branch, pushed: false, prUrl: null };
    }

    // The token goes in the remote URL for one push and is never persisted to
    // the clone's config, logged, or sent to a browser.
    const remote = `https://x-access-token:${token}@github.com/${repo}.git`;
    await run("git", ["push", "--force", remote, `HEAD:${branch}`], { cwd: dir });

    const base = await defaultBranch(repo, token);
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: message,
        head: branch,
        base,
        body: `Opened from a Relay session (\`${sessionId}\`).\n\n${changes.files.length} files changed, +${changes.insertions} −${changes.deletions}.`,
      }),
    });

    if (!res.ok) {
      // The branch is pushed either way — say so rather than implying the
      // whole thing failed.
      const detail = await res.text();
      return {
        ok: true,
        branch,
        pushed: true,
        prUrl: null,
        note: `branch pushed; PR not created (${res.status}) ${redactToken(detail.slice(0, 140))}`,
      };
    }

    const pr = (await res.json()) as { html_url?: string };
    return { ok: true, branch, pushed: true, prUrl: pr.html_url ?? null };
  } catch (err) {
    // Never echo the remote URL back — it carries the token.
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, error: redactToken(raw) };
  }
}

function redactToken(s: string): string {
  return s.replace(/x-access-token:[^@]+@/g, "x-access-token:***@");
}

async function defaultBranch(repo: string, token: string): Promise<string> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) return "main";
    const json = (await res.json()) as { default_branch?: string };
    return json.default_branch ?? "main";
  } catch {
    return "main";
  }
}
