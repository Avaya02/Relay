import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ChangedFile } from "@relay/shared";
import { cacheDirFor } from "./agent/sandbox.js";

const run = promisify(execFile);

export type RepoConfig = {
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
      note?: string;
    }
  | { ok: false; error: string };

// Keeps a rewritten lockfile from pushing a multi-MB patch to every browser.
const MAX_PATCH_BYTES = 400_000;

function redactToken(s: string): string {
  return s.replace(/x-access-token:[^@]+@/g, "x-access-token:***@");
}

export function createRepo(config: RepoConfig) {
  // Outside the user's repo so disposable clones never show in their working tree.
  const root = path.join(tmpdir(), "relayrun");
  // Keyed by source path: a shared pristine/ meant the first repo ever used won,
  // and later sessions silently ran against the wrong codebase.
  const pristineDir = path.join(
    root,
    "pristine",
    `${path.basename(config.sourcePath).replace(/[^a-zA-Z0-9._-]/g, "-")}-${createHash("sha256")
      .update(config.sourcePath)
      .digest("hex")
      .slice(0, 12)}`,
  );
  const sessionsDir = path.join(root, "sessions");

  let pristineReady: Promise<void> | null = null;

  // Concurrent `git add -A` calls (two participants joining, or a publish during
  // a changes request) collide on .git/index.lock, so git ops queue per directory.
  const repoLocks = new Map<string, Promise<unknown>>();

  function withRepoLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    const prior = repoLocks.get(dir) ?? Promise.resolve();
    // Chain through rejections so one failure doesn't wedge later callers.
    const next = prior.catch(() => {}).then(fn);
    repoLocks.set(dir, next.catch(() => {}));
    return next;
  }

  async function isGitRepo(dir: string): Promise<boolean> {
    try {
      await run("git", ["-C", dir, "rev-parse", "--git-dir"]);
      return true;
    } catch {
      return false;
    }
  }

  async function ensurePristine(): Promise<void> {
    // Ask git, not the filesystem: macOS reaps temp files but leaves directory
    // skeletons, so the path can exist without a repo and every run failed.
    if (await isGitRepo(pristineDir)) {
      // Refresh: pristine outlives the process and would otherwise be days stale.
      try {
        await run("git", ["-C", pristineDir, "fetch", "--prune", "origin", "HEAD"]);
        await run("git", ["-C", pristineDir, "reset", "--hard", "FETCH_HEAD"]);
        return;
      } catch {
        // Re-cloning is cheaper than diagnosing a broken pristine.
      }
    }
    await rm(pristineDir, { recursive: true, force: true });
    await mkdir(path.dirname(pristineDir), { recursive: true });
    await run("git", ["clone", config.sourcePath, pristineDir]);
  }

  function ensurePristineOnce(): Promise<void> {
    pristineReady ??= ensurePristine();
    return pristineReady;
  }

  // Stage first: `git diff` alone ignores new files. Unlocked because
  // publishSession calls it inside its own lock, which isn't reentrant.
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
        // Binary files report "-".
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
      // `git commit` fails on machines with no global user.email.
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

      // The clone is deleted when relayrun exits, so land the branch in the
      // user's repo; the per-session branch name never touches their checkout.
      await run("git", ["push", "--force", config.sourcePath, `HEAD:${branch}`], {
        cwd: dir,
      });

      const { githubRepo, githubToken } = config;
      if (!githubRepo || !githubToken) {
        return { ok: true, branch, pushed: false, prUrl: null };
      }

      // Token lives only in this one push's URL; never persisted, logged or sent on.
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
        // The branch is pushed either way.
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
      // Git errors can echo the remote URL, which carries the token.
      const raw = err instanceof Error ? err.message : String(err);
      return { ok: false, error: redactToken(raw) };
    }
  }

  return {
    // Folder name only: the full path would leak the host's directory layout.
    repoName(): string | null {
      return path.basename(config.sourcePath) || null;
    },

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
      await rm(cacheDirFor(dir), { recursive: true, force: true });
      repoLocks.delete(dir);
    },

    sessionChanges(dir: string): Promise<SessionChanges> {
      return withRepoLock(dir, () => computeSessionChanges(dir));
    },

    publishSession(dir: string, sessionId: string, message: string): Promise<PublishResult> {
      return withRepoLock(dir, () => doPublish(dir, sessionId, message));
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
