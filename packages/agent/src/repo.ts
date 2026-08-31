import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ChangedFile } from "@relay/shared";

const run = promisify(execFile);

export type RepoConfig = {
  /** The operator's own repository — whatever directory they ran the CLI in. */
  sourcePath: string;
  githubRepo: string | null;
  githubToken: string | null;
};

export type SessionChanges = {
  files: ChangedFile[];
  insertions: number;
  deletions: number;
  patch: string;
};

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

// Cap the patch shipped to browsers. A runaway agent that rewrites a lockfile
// shouldn't push a multi-MB string down every participant's socket.
const MAX_PATCH_BYTES = 400_000;

function redactToken(s: string): string {
  return s.replace(/x-access-token:[^@]+@/g, "x-access-token:***@");
}

export function createRepo(config: RepoConfig) {
  // Scratch space under the OS temp dir, not inside the operator's repo — the
  // clones are disposable and must never show up in their working tree.
  const root = path.join(tmpdir(), "relay-agent");
  const pristineDir = path.join(root, "pristine");
  const sessionsDir = path.join(root, "sessions");

  let pristineReady: Promise<void> | null = null;

  /**
   * Serializes git operations per working directory.
   *
   * `sessionChanges` and `publishSession` both run a sequence of raw git
   * commands and both are reachable from more than one caller at once: two
   * participants joining in the same second each trigger a changes request, and
   * a publish can land while one is still in flight. Without this, concurrent
   * `git add -A` calls collide on `.git/index.lock` — caught live against a
   * two-participant session, where it surfaced as the request failing outright.
   *
   * A promise chain per directory rather than a mutex library: the only
   * property needed is "the next operation waits for the last one."
   */
  const repoLocks = new Map<string, Promise<unknown>>();

  function withRepoLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    const prior = repoLocks.get(dir) ?? Promise.resolve();
    // Chained even through a rejection: one failed operation must not wedge
    // every later caller on this directory.
    const next = prior.catch(() => {}).then(fn);
    repoLocks.set(dir, next.catch(() => {}));
    return next;
  }

  // `git clone` copies committed state only — no node_modules, no .DS_Store,
  // and deliberately none of the operator's uncommitted work.
  async function ensurePristine(): Promise<void> {
    if (existsSync(pristineDir)) return;
    await mkdir(path.dirname(pristineDir), { recursive: true });
    await run("git", ["clone", config.sourcePath, pristineDir]);
  }

  function ensurePristineOnce(): Promise<void> {
    pristineReady ??= ensurePristine();
    return pristineReady;
  }

  /**
   * Everything the agent touched this session, relative to the clone's starting
   * commit. Staging first is what makes new files (the common case) show up at
   * all; `git diff` alone ignores untracked paths. The working dir is
   * disposable, so leaving things staged costs nothing.
   *
   * Unlocked: publishSession calls this from inside its own lock, and the lock
   * isn't reentrant.
   */
  async function computeSessionChanges(dir: string): Promise<SessionChanges> {
    await run("git", ["add", "-A"], { cwd: dir });

    const { stdout: numstat } = await run("git", ["diff", "--cached", "--numstat"], {
      cwd: dir,
      maxBuffer: 32 * 1024 * 1024,
    });

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
      // machines with no global user.email configured.
      await run(
        "git",
        [
          "-c",
          "user.email=relay@localhost",
          "-c",
          "user.name=Relay",
          "commit",
          "-m",
          message,
        ],
        { cwd: dir },
      );

      // Land the branch in the operator's own repository, by path. The session
      // clone is deleted when the room empties, so a commit that only exists
      // there is gone within seconds of the run finishing. Pushing a branch
      // whose name is unique per session never touches whatever they have
      // checked out.
      await run("git", ["push", "--force", config.sourcePath, `HEAD:${branch}`], {
        cwd: dir,
      });

      const { githubRepo, githubToken } = config;
      if (!githubRepo || !githubToken) {
        return { ok: true, branch, pushed: false, prUrl: null };
      }

      // The token goes in the remote URL for one push and is never persisted to
      // the clone's config, logged, or sent to a browser.
      const remote = `https://x-access-token:${githubToken}@github.com/${githubRepo}.git`;
      await run("git", ["push", "--force", remote, `HEAD:${branch}`], { cwd: dir });

      const base = await defaultBranch(githubRepo, githubToken);
      const res = await fetch(`https://api.github.com/repos/${githubRepo}/pulls`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${githubToken}`,
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

  return {
    /**
     * Just the folder name, for the session header. A watcher needs to know
     * which codebase they're watching; the operator's full directory layout is
     * both noise and a needless disclosure.
     */
    repoName(): string | null {
      return path.basename(config.sourcePath) || null;
    },

    /**
     * A clone of the pristine copy, so a session can edit and commit freely
     * without touching the pristine tree, let alone the operator's own.
     */
    async prepareWorkingDir(sessionId: string): Promise<string> {
      await ensurePristineOnce();
      const dir = path.join(sessionsDir, sessionId);
      await rm(dir, { recursive: true, force: true });
      await mkdir(sessionsDir, { recursive: true });
      await run("git", ["clone", pristineDir, dir]);
      return dir;
    },

    async disposeWorkingDir(sessionId: string): Promise<void> {
      const dir = path.join(sessionsDir, sessionId);
      await rm(dir, { recursive: true, force: true });
      // Otherwise repoLocks accumulates one entry per session for the life of
      // the process.
      repoLocks.delete(dir);
    },

    sessionChanges(dir: string): Promise<SessionChanges> {
      return withRepoLock(dir, () => computeSessionChanges(dir));
    },

    /**
     * Commit the session's work to a branch, push it to the operator's repo,
     * and open a pull request if a GitHub repo and token are configured.
     */
    publishSession(dir: string, sessionId: string, message: string): Promise<PublishResult> {
      // The whole sequence is one queued unit.
      return withRepoLock(dir, () => doPublish(dir, sessionId, message));
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
