import { query, type Settings } from "@anthropic-ai/claude-agent-sdk";
import type { RunEmitter } from "../emit.js";
import { redactKeys } from "../redact.js";
import { detailForCall } from "./diff.js";
import { resultText, summarizeToolCall, summarizeToolResult } from "./summarize.js";
import { orientation } from "./orient.js";
import { mkdir } from "node:fs/promises";
import { cacheDirFor, sandboxOptions } from "./sandbox.js";

type PendingTool = { tool: string; verb: string; target: string };

export type RunOptions = {
  emit: RunEmitter;
  instruction: string;
  workingDir: string;
  signal: AbortSignal;
  resume?: string;
  apiKeyHelper?: string;
  model: string;
  // Null only with --no-sandbox, which restores the unrestricted agent.
  sandbox: { sourcePath: string; allowDomains: string[] } | null;
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

  // The SDK may report a result before throwing on abort; one ending per run, or
  // the second one opens a phantom turn in the transcript.
  let settled = false;
  const stopped = () => {
    if (!settled) emit.event("agent_stopped", { reason: "stopped" });
    settled = true;
    emit.status("idle");
  };

  try {
    const where = await orientation(workingDir);
    // The box can't create it: its parent is outside what commands may write.
    if (opts.sandbox) await mkdir(cacheDirFor(workingDir), { recursive: true });

    const q = query({
      prompt: instruction,
      options: {
        cwd: workingDir,
        model,
        ...(where
          ? { systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: where } }
          : {}),
        abortController: abort,
        ...(opts.sandbox
          ? sandboxOptions({ workingDir, ...opts.sandbox })
          : { permissionMode: "bypassPermissions" as const, allowDangerouslySkipPermissions: true }),
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
        settled = true;
        // An API failure (bad key, rate limit, usage cap) still arrives as subtype
        // "success", flagged is_error, with the reason in `result`.
        if (msg.subtype === "success" && !msg.is_error) {
          emit.event("agent_done", {
            steps: msg.num_turns,
            durationMs: msg.duration_ms,
            costUsd: msg.total_cost_usd,
          });
          emit.status("done");
        } else {
          const reason = msg.subtype === "success" ? msg.result : `agent stopped: ${msg.subtype}`;
          emit.event("agent_error", { message: redactKeys(reason || "the agent failed") });
          emit.status("error");
        }
      }
    }
    if (abort.signal.aborted && !settled) stopped();
  } catch (err) {
    // A deliberate stop, not an error; still clear "working" so reconnecting
    // viewers don't see a status that never resolves.
    if (abort.signal.aborted) {
      stopped();
      return;
    }
    // The SDK throws after an error result too; the result already ended the turn,
    // and a second ending would open a phantom one.
    if (settled) return;
    emit.event("agent_error", {
      message: redactKeys(err instanceof Error ? err.message : String(err)),
    });
    emit.status("error");
  }
}
