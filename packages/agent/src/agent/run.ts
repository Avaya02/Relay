import { query, type Settings } from "@anthropic-ai/claude-agent-sdk";
import type { RunEmitter } from "../emit.js";
import { redactKeys } from "../redact.js";
import { detailForCall } from "./diff.js";
import { resultText, summarizeToolCall, summarizeToolResult } from "./summarize.js";
import { orientation } from "./orient.js";

/**
 * Agent SDK wrapper, verified against the shipped types of
 * @anthropic-ai/claude-agent-sdk@0.3.220 rather than the docs pages, which
 * disagreed with the .d.ts in a few places — notably: assistant content lives
 * at `message.content`, and tool *results* arrive as `type: "user"` messages.
 */

// Tool results come back detached from their call, so keep enough context to
// render a meaningful result row when one lands.
type PendingTool = { tool: string; verb: string; target: string };

export type RunOptions = {
  emit: RunEmitter;
  instruction: string;
  workingDir: string;
  signal: AbortSignal;
  /** Agent session id from a previous turn, to continue that conversation. */
  resume?: string;
  /**
   * Path to a script that prints the API key. Set only when the operator
   * supplied a key explicitly — see sessionKey.ts for why the env var alone
   * does not work.
   */
  apiKeyHelper?: string;
};

export async function runRealAgent(opts: RunOptions): Promise<void> {
  const { emit, instruction, workingDir, signal, resume, apiKeyHelper } = opts;
  const pending = new Map<string, PendingTool>();
  const model = process.env.RELAY_MODEL ?? "claude-haiku-4-5";

  // The SDK wants an AbortController, but ownership of stopping a run belongs
  // to the runner, which already holds one. Bridge the two.
  const abort = new AbortController();
  if (signal.aborted) abort.abort();
  else signal.addEventListener("abort", () => abort.abort(), { once: true });

  // Inline settings, so a run is unaffected by whatever the operator has in
  // their own settings files, and the helper can't be overridden.
  const keyOptions: { settings: Settings } | Record<string, never> = apiKeyHelper
    ? { settings: { apiKeyHelper } }
    : {};

  try {
    // Resolved before the run so the agent opens by acting rather than by
    // working out where it is — see orient.ts.
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
        // Headless: there is no human here to approve each tool call. The agent
        // runs with the operator's own permissions on their own machine, which
        // is the same trust boundary as running Claude Code directly.
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        ...keyOptions,
        ...(resume ? { resume } : {}),
      },
    });

    for await (const msg of q) {
      // Guarded on an actual change: the SDK repeats session_id on nearly every
      // message, and reporting it each time would fire a Postgres upsert per
      // tool call instead of once per run.
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
              // `id` pairs this with its result so the ledger renders ONE row
              // per action: it appears now, pending, and completes on arrival.
              id: block.id,
              tool: block.name,
              verb,
              target,
              detail: detailForCall(block.name, input, target),
            });
          }
        }
      } else if (msg.type === "user") {
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
              // Bulk output goes behind the disclosure rather than being
              // truncated away — the summary stays scannable, the detail stays
              // available.
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
    // An abort is a deliberate stop, not a failure to report as one. Still
    // clear "working", so a driver who reconnects later isn't left watching a
    // status that will never resolve on its own.
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
