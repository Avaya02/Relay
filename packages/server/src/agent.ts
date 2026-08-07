import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { setStatus, type Session } from "./sessions.js";
import { appendEvent } from "./transcript.js";
import { prepareWorkingDir } from "./repo.js";
import { runMockAgent } from "./agent-mock.js";

// Agent SDK wrapper (spec §5). Verified against the shipped types of
// @anthropic-ai/claude-agent-sdk@0.3.220 rather than the docs pages, which
// disagreed with the .d.ts in a few places (notably: assistant content lives
// at `message.content`, and tool *results* arrive as `type: "user"` messages).
//
// Defaults to the mock so nothing spends API credit by accident — set
// RELAY_AGENT=real to run the real thing.
const USE_REAL_AGENT = process.env.RELAY_AGENT === "real";

// Chosen explicitly; overridable without touching code.
const MODEL = process.env.RELAY_MODEL ?? "claude-haiku-4-5";

export function runAgent(session: Session, instruction: string): void {
  if (!USE_REAL_AGENT) {
    runMockAgent(session, instruction);
    return;
  }
  void runRealAgent(session, instruction);
}

// Human-readable one-liners for the action ledger. The spec is explicit that
// raw tool args must not be dumped into the UI (§5) — the ledger should read
// like a flight recorder, not a debug log.
function summarizeToolCall(
  tool: string,
  input: Record<string, unknown>,
  workingDir: string,
): string {
  // Paths render relative to the repo root. An agent that guesses a path
  // outside the working dir would otherwise produce a "../../../../.." chain,
  // so fall back to the bare filename in that case.
  const rel = (p: unknown) => {
    if (typeof p !== "string") return "";
    const relative = path.relative(workingDir, p);
    if (!relative) return path.basename(p);
    return relative.startsWith("..") ? path.basename(p) : relative;
  };
  const clip = (s: unknown, n = 60) => {
    const text = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
    return text.length > n ? `${text.slice(0, n)}…` : text;
  };

  switch (tool) {
    case "Bash":
      return `ran ${clip(input.command)}`;
    case "Read":
      return `read ${rel(input.file_path)}`;
    case "Write":
      return `wrote ${rel(input.file_path)}`;
    case "Edit":
      return `edited ${rel(input.file_path)}`;
    case "NotebookEdit":
      return `edited ${rel(input.notebook_path)}`;
    case "Glob":
      return `searched ${clip(input.pattern, 40)}`;
    case "Grep":
      return `grepped ${clip(input.pattern, 40)}`;
    case "WebFetch":
      return `fetched ${clip(input.url, 50)}`;
    case "WebSearch":
      return `searched the web for ${clip(input.query, 40)}`;
    case "Task":
      return `delegated: ${clip(input.description, 50)}`;
    case "TodoWrite":
      return "updated its plan";
    default:
      return tool;
  }
}

// Tool results come back detached from the call, so keep enough context to
// render a meaningful result row.
type PendingTool = { tool: string; summary: string };

function summarizeToolResult(content: unknown, workingDir: string): string {
  const text = Array.isArray(content)
    ? content
        .map((b) =>
          b && typeof b === "object" && "text" in b ? String(b.text) : "",
        )
        .join(" ")
    : typeof content === "string"
      ? content
      : "";

  // Server-side absolute paths are noise in the ledger (and leak the host's
  // directory layout) — show them relative to the repo root instead.
  const cleaned = text
    .split(`${workingDir}/`)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "done";
  const lineCount = text.trim().split("\n").length;
  if (lineCount > 1) return `${lineCount} lines`;
  return cleaned.length > 70 ? `${cleaned.slice(0, 70)}…` : cleaned;
}

async function runRealAgent(
  session: Session,
  instruction: string,
): Promise<void> {
  const abort = new AbortController();
  session.agentAbort = abort;

  const pending = new Map<string, PendingTool>();

  try {
    // Clone lazily: a session that never gets an instruction never pays for it.
    session.workingDir ??= await prepareWorkingDir(session.id);
    const workingDir = session.workingDir;

    const q = query({
      prompt: instruction,
      options: {
        cwd: workingDir,
        model: MODEL,
        abortController: abort,
        // Headless: there is no human to approve each tool call. Scoped to a
        // disposable per-session clone — never the source repo (see repo.ts).
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        // Continue the same agent conversation across instructions, so
        // follow-ups are steering rather than a cold restart (spec §5).
        ...(session.agentSessionId ? { resume: session.agentSessionId } : {}),
      },
    });

    for await (const msg of q) {
      // Capture the SDK's session id so the next instruction can resume it.
      if ("session_id" in msg && msg.session_id) {
        session.agentSessionId = msg.session_id;
      }

      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            const text = block.text.trim();
            if (text) appendEvent(session, { kind: "agent_text", data: { text } });
          } else if (block.type === "tool_use") {
            const summary = summarizeToolCall(
              block.name,
              (block.input ?? {}) as Record<string, unknown>,
              workingDir,
            );
            pending.set(block.id, { tool: block.name, summary });
            appendEvent(session, {
              kind: "tool_call",
              data: { tool: block.name, summary },
            });
          }
        }
      } else if (msg.type === "user") {
        // Tool results arrive as a user turn carrying tool_result blocks.
        const content = msg.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type !== "tool_result") continue;
            const call = pending.get(block.tool_use_id);
            pending.delete(block.tool_use_id);
            appendEvent(session, {
              kind: "tool_result",
              data: {
                tool: call?.tool ?? "tool",
                ok: block.is_error !== true,
                // Surface *why* a step failed — a bare "failed" row tells a
                // watcher nothing, and recovering from tool errors is a normal
                // part of the agent's work.
                summary: block.is_error
                  ? `failed — ${summarizeToolResult(block.content, workingDir)}`
                  : summarizeToolResult(block.content, workingDir),
              },
            });
          }
        }
      } else if (msg.type === "result") {
        if (msg.subtype === "success") {
          appendEvent(session, { kind: "agent_done", data: {} });
          setStatus(session, "done");
        } else {
          appendEvent(session, {
            kind: "agent_error",
            data: { message: `agent stopped: ${msg.subtype}` },
          });
          setStatus(session, "error");
        }
      }
    }
  } catch (err) {
    // An abort is a deliberate stop, not a failure to report as one.
    if (abort.signal.aborted) return;
    appendEvent(session, {
      kind: "agent_error",
      data: { message: err instanceof Error ? err.message : String(err) },
    });
    setStatus(session, "error");
  } finally {
    if (session.agentAbort === abort) session.agentAbort = null;
  }
}
