import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ToolDetail } from "@relay/shared";
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
    toolCallStep(`${n}-1`, "Bash", "ran", "ls src/"),
    toolResultStep(`${n}-1`, "Bash", true, "12 lines", {
      type: "text",
      text: "App.tsx\nmain.tsx\nindex.css\ncomponents/\nhooks/\nlib/",
    }),
    textStep("Found the right spot. Making the change now."),
    toolCallStep(`${n}-2`, "Write", "wrote", "RELAY_NOTES.md", MOCK_DIFF),
    toolResultStep(`${n}-2`, "Write", true, "written"),
    toolCallStep(`${n}-3`, "Bash", "ran", "npm test"),
    toolResultStep(`${n}-3`, "Bash", false, "1 failing — App renders a counter", {
      type: "text",
      text: "FAIL src/App.test.tsx\n  ● App › renders a counter\n    expected 1 to be 0",
    }),
    textStep("That test asserted the old markup. Fixing the assertion."),
    toolCallStep(`${n}-4`, "Bash", "ran", "npm test"),
    toolResultStep(`${n}-4`, "Bash", true, "4 passed"),
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

  const runNext = () => {
    if (i >= script.length) {
      appendEvent(session, {
        kind: "agent_done",
        // Same shape the real agent reports, so the capstone row renders
        // identically offline.
        data: { steps: 4, durationMs: Date.now() - startedAt, costUsd: 0.0128 },
      });
      setStatus(session, "done");
      onSettled();
      return;
    }
    script[i++](session);
    setTimeout(runNext, STEP_DELAY_MS);
  };

  setTimeout(runNext, INITIAL_DELAY_MS);
}
