import { setStatus, type Session } from "./sessions.js";
import { appendEvent } from "./transcript.js";

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

function toolCallStep(tool: string, summary: string): ScriptStep {
  return (session) =>
    appendEvent(session, { kind: "tool_call", data: { tool, summary } });
}

function toolResultStep(tool: string, ok: boolean, summary: string): ScriptStep {
  return (session) =>
    appendEvent(session, { kind: "tool_result", data: { tool, ok, summary } });
}

function buildScript(instruction: string): ScriptStep[] {
  return [
    textStep(
      `On it — looking into "${instruction.trim() || "your request"}".`,
    ),
    toolCallStep("bash", "ran ls src/"),
    toolResultStep("bash", true, "12 files"),
    textStep("Found the right spot. Making the change now."),
    toolCallStep("edit", "edited src/App.tsx"),
    toolResultStep("edit", true, "12 lines changed"),
    toolCallStep("bash", "ran npm test"),
    toolResultStep("bash", true, "4 passed"),
    textStep("Done — tests pass."),
  ];
}

export function runMockAgent(session: Session, instruction: string): void {
  const script = buildScript(instruction);
  let i = 0;

  const runNext = () => {
    if (i >= script.length) {
      appendEvent(session, { kind: "agent_done", data: {} });
      setStatus(session, "done");
      return;
    }
    script[i++](session);
    setTimeout(runNext, STEP_DELAY_MS);
  };

  setTimeout(runNext, INITIAL_DELAY_MS);
}
