import { query, type Settings } from "@anthropic-ai/claude-agent-sdk";
import type { RunEmitter } from "../emit.js";
import { redactKeys } from "../redact.js";
import { detailForCall } from "./diff.js";
import { resultText, summarizeToolCall, summarizeToolResult } from "./summarize.js";
import { orientation } from "./orient.js";

type PendingTool = { tool: string; verb: string; target: string };

export type RunOptions = {
  emit: RunEmitter;
  instruction: string;
  workingDir: string;
  signal: AbortSignal;
  resume?: string;
  apiKeyHelper?: string;
  model: string;
};

export async function runRealAgent(opts: RunOptions): Promise<void> {
  const { emit, instruction, workingDir, signal, resume, apiKeyHelper, model } = opts;
  const pending = new Map<string, PendingTool>();

  const abort = new AbortController();
  if (signal.aborted) abort.abort();
  else signal.addEventListener("abort", () => abort.abort(), { once: true });

  // Inline settings so the operator's own settings files can't override the helper.
  const keyOptions: { settings: Settings } | Record<string, never> = apiKeyHelper
    ? { settings: { apiKeyHelper } }
    : {};

  try {
    const where = await orientation(workingDir);

    const q = query({
      prompt: instruction,
      options: {
        cwd: workingDir,
        model,
        ...(where
          ? { systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: where } }
          : {}),
        abortController: abort,
        // Headless, so nobody can approve tool calls; runs with the host's own
        // permissions on their own machine.
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        ...keyOptions,
        ...(resume ? { resume } : {}),
      },
    });

    for await (const msg of q) {
      // The SDK repeats session_id on nearly every message; only report changes
      // or each tool call triggers a Postgres upsert.
      if ("session_id" in msg && msg.session_id && msg.session_id !== opts.resume) {
        emit.agentSession(msg.session_id);
      }

      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            const text = block.text.trim();
            if (text) emit.event("agent_text", { text });
          } else if (block.type === "tool_use") {
            const input = (block.input ?? {}) as Record<string, unknown>;
            const { verb, target } = summarizeToolCall(block.name, input, workingDir);
            pending.set(block.id, { tool: block.name, verb, target });
            emit.event("tool_call", {
              id: block.id,
              tool: block.name,
              verb,
              target,
              detail: detailForCall(block.name, input, target),
            });
          }
        }
      } else if (msg.type === "user") {
        // Tool results arrive as "user" messages.
        const content = msg.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type !== "tool_result") continue;
            const call = pending.get(block.tool_use_id);
            pending.delete(block.tool_use_id);
            const ok = block.is_error !== true;
            const tool = call?.tool ?? "tool";
            const full = resultText(block.content).trim();
            emit.event("tool_result", {
              id: block.tool_use_id,
              tool,
              ok,
              summary: summarizeToolResult(tool, block.content, workingDir, ok),
              detail:
                full.split("\n").length > 1
                  ? { type: "text", text: full.split(`${workingDir}/`).join("") }
                  : undefined,
            });
          }
        }
      } else if (msg.type === "result") {
        if (msg.subtype === "success") {
          emit.event("agent_done", {
            steps: msg.num_turns,
            durationMs: msg.duration_ms,
            costUsd: msg.total_cost_usd,
          });
          emit.status("done");
        } else {
          emit.event("agent_error", { message: `agent stopped: ${msg.subtype}` });
          emit.status("error");
        }
      }
    }
  } catch (err) {
    // A deliberate stop, not an error; still clear "working" so reconnecting
    // viewers don't see a status that never resolves.
    if (abort.signal.aborted) {
      emit.status("idle");
      return;
    }
    emit.event("agent_error", {
      message: redactKeys(err instanceof Error ? err.message : String(err)),
    });
    emit.status("error");
  }
}
