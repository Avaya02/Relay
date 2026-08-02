import { setStatus, type Session } from "./sessions.js";
import { appendEvent } from "./transcript.js";

// MOCK AGENT — Phase 1.
//
// This stands in for the real @anthropic-ai/claude-agent-sdk integration
// (spec §5), which lands in Phase 4. No SDK import here on purpose: the
// point of building against a mock first is proving the real-time layer
// (sessions, broadcast, catch-up) at zero API cost. On `instruct`, it emits
// a fixed, canned sequence of events on a timer instead of actually running
// a model — the *shape* of the events (agent_text / tool_call / tool_result
// / agent_done) matches what the real agent will produce, so nothing
// downstream needs to change when Phase 4 swaps this file's internals.

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
