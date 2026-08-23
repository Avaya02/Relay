import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlanItem, ToolDetail } from "@relay/shared";
import { setStatus, type Session } from "./sessions.js";
import { appendEvent } from "./transcript.js";
import { prepareWorkingDir } from "./repo.js";

// MOCK AGENT — from Phase 1, kept as the offline/zero-cost path (spec §9
// Phase 4: "Keep the mock behind a flag so you can develop offline").
// Emits a fixed, canned sequence on a timer instead of running a model. The
// *shape* of its events matches the real agent's, so the whole front end and
// broadcast layer behave identically either way.

type ScriptStep = (session: Session) => void;

const STEP_DELAY_MS = 700;
const INITIAL_DELAY_MS = 400;

function textStep(text: string): ScriptStep {
  return (session) =>
    appendEvent(session, { kind: "agent_text", data: { text } });
}

// Mirrors the real agent's event shapes exactly (id / verb / target / detail),
// so the ledger's merge-and-expand path is the same offline as it is live.
function toolCallStep(
  id: string,
  tool: string,
  verb: string,
  target: string,
  detail?: ToolDetail,
): ScriptStep {
  return (session) =>
    appendEvent(session, {
      kind: "tool_call",
      data: { id, tool, verb, target, detail },
    });
}

function toolResultStep(
  id: string,
  tool: string,
  ok: boolean,
  summary: string,
  detail?: ToolDetail,
): ScriptStep {
  return (session) =>
    appendEvent(session, {
      kind: "tool_result",
      data: { id, tool, ok, summary, detail },
    });
}

// The mock has to exercise the plan strip too, for the same reason it had to
// actually write files: a surface that only appears under the real agent can
// only be tested by spending API quota.
function planStep(
  id: string,
  done: number,
  active: number | null,
  steps: string[],
): ScriptStep[] {
  const todos: PlanItem[] = steps.map((content, i) => ({
    content,
    status:
      i < done ? "completed" : i === active ? "in_progress" : "pending",
    activeForm: content.replace(/^[A-Z]/, (c) => c.toLowerCase()),
  }));
  const activeItem = todos.find((t) => t.status === "in_progress");
  const target = activeItem
    ? (activeItem.activeForm ?? activeItem.content)
    : done === steps.length
      ? "all steps complete"
      : `${steps.length} steps`;
  return [
    toolCallStep(id, "TodoWrite", "planned", target, { type: "plan", todos }),
    toolResultStep(id, "TodoWrite", true, "plan updated"),
  ];
}

// Real agents answer "what's in here?" with a wall of markdown — that is the
// case that used to push the whole ledger off screen, so the mock has to
// produce one or the clamp is untestable offline.
const MOCK_LONG_REPLY = [
  "Here's what changed, with the surrounding structure for context:",
  "",
  "**Root**",
  "",
  ...[
    "README.md",
    "RELAY_NOTES.md",
    "package.json",
    "pnpm-workspace.yaml",
    "tsconfig.json",
  ].map((f) => `- \`${f}\``),
  "",
  "**src/**",
  "",
  ...[
    "App.tsx",
    "main.tsx",
    "index.css",
    "components/Button.tsx",
    "components/Panel.tsx",
    "hooks/use-store.ts",
    "hooks/use-theme.ts",
    "lib/api.ts",
    "lib/format.ts",
    "lib/types.ts",
  ].map((f) => `- \`src/${f}\``),
  "",
  "**tests/**",
  "",
  ...["App.test.tsx", "lib/format.test.ts", "setup.ts"].map(
    (f) => `- \`tests/${f}\``,
  ),
  "",
  "The only file I added is `RELAY_NOTES.md`; everything else was already tracked.",
].join("\n");

const MOCK_PLAN = [
  "Read the existing notes file",
  "Write RELAY_NOTES.md",
  "Run the test suite",
  "Fix the failing assertion",
];

const MOCK_DIFF: ToolDetail = {
  type: "diff",
  path: "RELAY_NOTES.md",
  lines: [
    { op: "+", text: "# Relay notes" },
    { op: "+", text: "" },
    { op: "+", text: "Written by the mock agent." },
  ],
};

function buildScript(instruction: string): ScriptStep[] {
  const n = Date.now().toString(36);
  return [
    textStep(
      `On it — looking into **"${instruction.trim() || "your request"}"**.`,
    ),
    ...planStep(`${n}-p1`, 0, 0, MOCK_PLAN),
    toolCallStep(`${n}-1`, "Bash", "ran", "ls src/"),
    toolResultStep(`${n}-1`, "Bash", true, "12 lines", {
      type: "text",
      text: "App.tsx\nmain.tsx\nindex.css\ncomponents/\nhooks/\nlib/",
    }),
    textStep("Found the right spot. Making the change now."),
    ...planStep(`${n}-p2`, 1, 1, MOCK_PLAN),
    toolCallStep(`${n}-2`, "Write", "wrote", "RELAY_NOTES.md", MOCK_DIFF),
    toolResultStep(`${n}-2`, "Write", true, "written"),
    // One nested path, deliberately: a root-only mock can't exercise the
    // workspace rail's directory/filename split, and a surface that only
    // appears under the real agent can only be tested by spending API quota.
    toolCallStep(`${n}-2b`, "Write", "wrote", "docs/session-log.md", {
      type: "diff",
      path: "docs/session-log.md",
      lines: [
        { op: "+", text: "# Session log" },
        { op: "+", text: "" },
        { op: "+", text: "Nested so the file list has a path to shorten." },
      ],
    }),
    toolResultStep(`${n}-2b`, "Write", true, "written"),
    ...planStep(`${n}-p3`, 2, 2, MOCK_PLAN),
    toolCallStep(`${n}-3`, "Bash", "ran", "npm test"),
    toolResultStep(`${n}-3`, "Bash", false, "1 failing — App renders a counter", {
      type: "text",
      text: "FAIL src/App.test.tsx\n  ● App › renders a counter\n    expected 1 to be 0",
    }),
    textStep("That test asserted the old markup. Fixing the assertion."),
    ...planStep(`${n}-p4`, 3, 3, MOCK_PLAN),
    toolCallStep(`${n}-4`, "Bash", "ran", "npm test"),
    toolResultStep(`${n}-4`, "Bash", true, "4 passed"),
    ...planStep(`${n}-p5`, 4, null, MOCK_PLAN),
    textStep(MOCK_LONG_REPLY),
    textStep("Done — tests pass."),
  ];
}

// The mock claims to edit files; it should actually edit them. Otherwise the
// offline path can't exercise anything downstream of the working dir — the
// session diff and publish flow would only ever be testable by spending real
// API quota, which defeats the point of having a mock at all.
//
// Best-effort: if no source repo is configured, the mock still streams its
// events and simply produces no file changes.
async function applyMockEdits(session: Session): Promise<void> {
  try {
    session.workingDir ??= await prepareWorkingDir(session.id);
    const dir = session.workingDir;
    await writeFile(
      path.join(dir, "RELAY_NOTES.md"),
      `# Relay notes\n\nWritten by the mock agent at ${new Date().toISOString()}.\n\n` +
        `This file exists so the session-diff and publish flow can be exercised\n` +
        `without spending API quota.\n`,
    );
    await mkdir(path.join(dir, "docs"), { recursive: true });
    await writeFile(
      path.join(dir, "docs", "session-log.md"),
      `# Session log\n\nNested so the file list has a path to shorten.\n`,
    );
    await appendFile(
      path.join(dir, "README.md"),
      `\n<!-- touched by a Relay mock session -->\n`,
    );
  } catch (err) {
    console.error(
      "mock agent: no working dir, continuing without file changes:",
      err instanceof Error ? err.message : err,
    );
  }
}

export function runMockAgent(
  session: Session,
  instruction: string,
  onSettled: () => void,
): void {
  const script = buildScript(instruction);
  const startedAt = Date.now();
  let i = 0;
  void applyMockEdits(session);

  // The mock needs a real AbortController too — otherwise the Stop button
  // only ever works against the real SDK, and the one path that's testable
  // without spending API credit is exactly the one it can't be tested on.
  const abort = new AbortController();
  session.agentAbort = abort;
  abort.signal.addEventListener(
    "abort",
    () => {
      setStatus(session, "idle");
      if (session.agentAbort === abort) session.agentAbort = null;
      onSettled();
    },
    { once: true },
  );

  const runNext = () => {
    if (abort.signal.aborted) return; // the listener above already settled this run

    if (i >= script.length) {
      appendEvent(session, {
        kind: "agent_done",
        // Same shape the real agent reports, so the capstone row renders
        // identically offline.
        data: { steps: 4, durationMs: Date.now() - startedAt, costUsd: 0.0128 },
      });
      setStatus(session, "done");
      if (session.agentAbort === abort) session.agentAbort = null;
      onSettled();
      return;
    }
    script[i++](session);
    setTimeout(runNext, STEP_DELAY_MS);
  };

  setTimeout(runNext, INITIAL_DELAY_MS);
}
