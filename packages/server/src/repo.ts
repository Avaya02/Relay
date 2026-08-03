import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

// The user's real project. This path is READ-ONLY as far as this server is
// concerned: it is only ever the `git clone` *source*. The agent's cwd is
// never set to it — see workingDirFor() below. Nothing here writes to it.
const SOURCE_REPO =
  process.env.RELAY_SOURCE_REPO ?? "/Applications/Projects/PromptGuard";

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
  await run("git", ["clone", SOURCE_REPO, PRISTINE_DIR]);
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
  await rm(path.join(SESSIONS_DIR, sessionId), {
    recursive: true,
    force: true,
  });
}

// Spec §6.6's reset, for reusing a working dir in place rather than recloning.
export async function resetWorkingDir(dir: string): Promise<void> {
  await run("git", ["reset", "--hard"], { cwd: dir });
  await run("git", ["clean", "-fd"], { cwd: dir });
}
