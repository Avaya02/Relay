import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { createRepo } from "../src/repo.js";

const run = promisify(execFile);

// The real code writes under tmpdir()/relayrun, which is also where a developer's
// own sessions live. TMPDIR is redirected for the whole file so a test run can
// never delete work belonging to a live relayrun process on the same machine.
const realTmp = process.env.TMPDIR;
let sandbox: string;

before(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "relayrun-test-"));
  process.env.TMPDIR = sandbox;
});

after(async () => {
  process.env.TMPDIR = realTmp;
  await rm(sandbox, { recursive: true, force: true });
});

async function makeRepo(name: string, marker: string): Promise<string> {
  const dir = path.join(sandbox, name);
  await mkdir(dir, { recursive: true });
  await run("git", ["init", "-b", "main"], { cwd: dir });
  await writeFile(path.join(dir, `${marker}.txt`), marker);
  await commitAll(dir, "init");
  return dir;
}

async function commitAll(dir: string, message: string): Promise<void> {
  await run("git", ["add", "-A"], { cwd: dir });
  await run(
    "git",
    ["-c", "user.email=test@test", "-c", "user.name=test", "commit", "-m", message],
    { cwd: dir },
  );
}

const repoFor = (sourcePath: string) =>
  createRepo({ sourcePath, githubRepo: null, githubToken: null });

test("a session gets its own repository, not whichever ran first", async () => {
  // The pristine clone was once a single shared directory, so the first repo the
  // CLI ever ran in won permanently: every later repo found the path already
  // present, skipped cloning, and ran the agent against the wrong codebase under
  // the right repo's name. Silent, and the worst failure the CLI can have.
  const alpha = await makeRepo("alpha", "ALPHA");
  const beta = await makeRepo("beta", "BETA");

  const alphaFiles = await readdir(await repoFor(alpha).prepareWorkingDir("s-alpha"));
  const betaFiles = await readdir(await repoFor(beta).prepareWorkingDir("s-beta"));

  assert.ok(alphaFiles.includes("ALPHA.txt"), `alpha session saw ${alphaFiles}`);
  assert.ok(betaFiles.includes("BETA.txt"), `beta session saw ${betaFiles} — cross-repo leak`);
  assert.ok(!betaFiles.includes("ALPHA.txt"), "beta session was given alpha's files");
});

test("a pristine whose files were reaped is rebuilt, not reused", async () => {
  // macOS deletes files from its per-user temp directory after a few days but
  // leaves the directory skeletons, so the path outlives the repository inside
  // it. An existence check passed, the clone then failed, and because nothing
  // else deletes pristine the failure repeated forever.
  const source = await makeRepo("reaped", "REAPED");
  await repoFor(source).prepareWorkingDir("s-first");

  const pristineRoot = path.join(sandbox, "relayrun", "pristine");
  const [entry] = await readdir(pristineRoot);
  const hollow = path.join(pristineRoot, entry);
  await rm(path.join(hollow, ".git"), { recursive: true, force: true });
  await mkdir(path.join(hollow, ".git"), { recursive: true });

  const files = await readdir(await repoFor(source).prepareWorkingDir("s-second"));
  assert.ok(files.includes("REAPED.txt"), `did not recover: ${files}`);
});

test("a commit made after the first session reaches the next one", async () => {
  // Pristine outlives the process, so a clone cached by an earlier run handed
  // the agent the repository as it was days ago with nothing to say it was stale.
  const source = await makeRepo("stale", "FIRST");
  await repoFor(source).prepareWorkingDir("s-before");

  await writeFile(path.join(source, "SECOND.txt"), "second");
  await commitAll(source, "second");

  const files = await readdir(await repoFor(source).prepareWorkingDir("s-after"));
  assert.ok(files.includes("SECOND.txt"), `session got a stale clone: ${files}`);
});
