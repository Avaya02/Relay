#!/usr/bin/env node
/**
 * Recapture docs/session.png and docs/plan.png.
 *
 *   pnpm build                              # server, agent and web must be built
 *   pnpm dlx playwright install chromium    # once
 *   node scripts/capture-screenshots.mjs
 *
 * Runs an isolated stack on non-default ports, so it can never touch a live
 * :3000/:4000, and drives the mock agent: a capture costs no API credit and
 * replays a fixed script instead of running real tools against a real repo.
 */

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const WEB_PORT = 4317;
const SERVER_PORT = 4318;
const OUT = "docs";

// The three-column shell collapses below 1100px, and that shell is the thing
// worth showing. deviceScaleFactor 2 keeps the 12px mono ledger legible.
const VIEWPORT = { width: 1440, height: 900 };

const children = [];
const run = (cmd, args, env, opts = {}) => {
  const child = spawn(cmd, args, {
    stdio: opts.pipe ? ["ignore", "pipe", "inherit"] : "inherit",
    env: { ...process.env, ...env },
  });
  children.push(child);
  return child;
};

async function waitFor(url, label, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`${label} never came up at ${url}`);
}

const cleanup = () => {
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
};
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(1);
});

const main = async () => {
  mkdirSync(OUT, { recursive: true });

  run("node", ["packages/server/dist/index.js"], { PORT: String(SERVER_PORT) });
  run(
    "pnpm",
    ["--filter", "@relay/web", "exec", "next", "start", "-p", String(WEB_PORT)],
    { NEXT_PUBLIC_WS_URL: `ws://localhost:${SERVER_PORT}` },
  );

  await waitFor(`http://localhost:${SERVER_PORT}/healthz`, "relay server");
  await waitFor(`http://localhost:${WEB_PORT}/`, "web");

  // --mock is not optional here. The real agent would spend credit and operate
  // on whatever repository this is run from; the mock is offline and scripted.
  const agent = run(
    "pnpm",
    [
      "--filter", "@relay/agent", "exec", "relayrun",
      "--mock",
      "--server", `http://localhost:${SERVER_PORT}`,
      "--web", `http://localhost:${WEB_PORT}`,
    ],
    {},
    { pipe: true },
  );

  // The CLI prints "  session  <id>"; there is no session-list endpoint to ask
  // instead, so this reads the id off that line.
  const id = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("relayrun printed no session id")), 60_000);
    let buf = "";
    agent.stdout.on("data", (chunk) => {
      const text = String(chunk);
      process.stdout.write(text);
      buf += text;
      const m = buf.match(/^\s*session\s+(\S+)\s*$/m);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
  });
  console.log(`\ncapturing session ${id}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${WEB_PORT}/session/${id}`);

  // The join gate asks for a display name before the session renders.
  const name = page.locator('input[placeholder="your name"]');
  if (await name.count()) {
    await name.fill("avi");
    await page.getByRole("button", { name: /^join$/i }).click();
  }

  // An empty transcript is a worse screenshot than none, so wait for real rows
  // and then let the mock script get far enough in to fill the pane.
  await page.waitForSelector(".ledger-action", { timeout: 60_000 });
  await sleep(12_000);

  await page.screenshot({ path: `${OUT}/session.png` });
  console.log(`wrote ${OUT}/session.png`);

  // plan.png is the same run with the plan strip opened.
  const plan = page.locator(".plan-bar");
  if (await plan.count()) {
    await plan.click();
    await sleep(800);
  }
  await page.screenshot({ path: `${OUT}/plan.png` });
  console.log(`wrote ${OUT}/plan.png`);

  await browser.close();
  cleanup();
  process.exit(0);
};

main().catch((err) => {
  console.error(err);
  cleanup();
  process.exit(1);
});
