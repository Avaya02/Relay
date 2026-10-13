import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { SECRET_ENV, cacheDirFor, refuse, sandboxOptions } from "../src/agent/sandbox.js";

const signal = new AbortController().signal;
const ask = (tool: string, input: Record<string, unknown>) =>
  refuse(tool, input, { signal, toolUseID: "t", requestId: "r" });

test("secret-looking variables are hidden, ordinary ones are not", () => {
  const secret = [
    "GITHUB_TOKEN", "GH_TOKEN", "NPM_TOKEN", "ANTHROPIC_API_KEY", "RELAY_SESSION_API_KEY",
    "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "OPENAI_API_KEY",
    "DATABASE_URL", "REDIS_URL", "SENTRY_DSN", "DB_PASSWORD", "DB_PASS", "JWT_SECRET",
    "SSH_AUTH_SOCK", "STRIPE_KEY", "CLAUDE_CODE_OAUTH_TOKEN",
  ];
  const ordinary = [
    "PATH", "HOME", "PWD", "SHELL", "LANG", "TERM", "USER", "NODE_ENV",
    "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "KEYCHAIN_PATH", "TOKENIZERS_PARALLELISM",
  ];
  for (const name of secret) assert.ok(SECRET_ENV.test(name), `${name} should be hidden`);
  for (const name of ordinary) assert.ok(!SECRET_ENV.test(name), `${name} should stay visible`);
});

test("the box denies the host's checkout and credential folders, and allows only the cache to be written", () => {
  process.env.PROBE_SERVICE_TOKEN = "x";
  const workingDir = "/tmp/relayrun/sessions/abc";
  const opts = sandboxOptions({
    workingDir,
    sourcePath: "/Users/me/project",
    allowDomains: ["example.internal"],
  });
  delete process.env.PROBE_SERVICE_TOKEN;

  assert.equal(opts.permissionMode, "acceptEdits");
  assert.equal(opts.sandbox?.enabled, true);
  assert.equal(opts.sandbox?.allowUnsandboxedCommands, false);
  assert.equal(opts.sandbox?.failIfUnavailable, true);
  assert.equal(opts.sandbox?.network?.strictAllowlist, true);
  assert.ok(opts.sandbox?.network?.allowedDomains?.includes("registry.npmjs.org"));
  assert.ok(opts.sandbox?.network?.allowedDomains?.includes("example.internal"));

  const denyRead = opts.sandbox?.filesystem?.denyRead ?? [];
  assert.ok(denyRead.includes("/Users/me/project"));
  assert.ok(denyRead.includes("~/.ssh"));
  assert.ok(denyRead.includes("~/.aws"));
  assert.ok(denyRead.includes("~/.npmrc"), "npm publish tokens live here");
  assert.deepEqual(opts.sandbox?.filesystem?.allowWrite, [cacheDirFor(workingDir)]);

  const hidden = opts.sandbox?.credentials?.envVars?.map((v) => v.name) ?? [];
  assert.ok(hidden.includes("PROBE_SERVICE_TOKEN"));
  assert.ok(!hidden.includes("PATH"));
  assert.equal(opts.env?.npm_config_cache, `${cacheDirFor(workingDir)}/npm`);
  assert.equal(opts.env?.npm_config_userconfig, `${cacheDirFor(workingDir)}/npmrc`);
});

test("the cache lives beside the clone, never inside it", () => {
  const workingDir = "/tmp/relayrun/sessions/abc";
  const rel = path.relative(workingDir, cacheDirFor(workingDir));
  assert.ok(rel.startsWith(".."), "a cache inside the clone would show up as session changes");
});

test("shell commands run boxed; leaving the box or the folder is refused", async () => {
  assert.equal((await ask("Bash", { command: "FOO=bar npm test" }))?.behavior, "allow");
  assert.equal((await ask("Bash", { command: "ls", dangerouslyDisableSandbox: true }))?.behavior, "deny");
  assert.equal((await ask("Read", { file_path: "/Users/me/.ssh/id_ed25519" }))?.behavior, "deny");
  assert.equal((await ask("Edit", { file_path: "/Users/me/.zshrc" }))?.behavior, "deny");
  assert.equal((await ask("WebFetch", { url: "http://192.168.1.1" }))?.behavior, "deny");
  assert.equal((await ask("WebSearch", { query: "vitest config" }))?.behavior, "allow");
});
