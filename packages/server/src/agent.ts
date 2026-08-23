import path from "node:path";
import { query, type Settings } from "@anthropic-ai/claude-agent-sdk";
import type { DiffLine, PlanItem, ToolDetail } from "@relay/shared";
import { liveParticipantCount, setStatus, type Session } from "./sessions.js";
import { appendEvent } from "./transcript.js";
import { prepareWorkingDir } from "./repo.js";
import { runMockAgent } from "./agent-mock.js";
import { mirrorSessionMeta } from "./persist.js";
import { redactKeys } from "./validate.js";
import { apiKeyHelperPath, SESSION_KEY_ENV } from "./sessionKey.js";

// Agent SDK wrapper (spec §5). Verified against the shipped types of
// @anthropic-ai/claude-agent-sdk@0.3.220 rather than the docs pages, which
// disagreed with the .d.ts in a few places (notably: assistant content lives
// at `message.content`, and tool *results* arrive as `type: "user"` messages).
//
// Defaults to the mock so nothing spends API credit by accident — set
// RELAY_AGENT=real to run the real thing.
//
// Read inside the function, not as a module-level const: ESM evaluates a
// file's imports before its own top-level code runs, so index.ts's
// `import { attachWs } from "./ws.js"` (which reaches this file) would
// resolve before index.ts's process.loadEnvFile() call ever executed. A
// frozen const here would permanently miss anything loaded from .env.
export function runAgent(session: Session, instruction: string): void {
  // A supplied key that can't actually be honoured must not fall through to
  // the host's own credentials. That would bill the wrong account behind a UI
  // saying the opposite — the one outcome worse than refusing to run.
  if (session.apiKey !== null && !apiKeyHelperPath()) {
    appendEvent(session, {
      kind: "agent_error",
      data: {
        message:
          "this server can't apply a supplied API key, so the run was not started",
      },
    });
    setStatus(session, "error");
    onRunSettled(session);
    return;
  }

  // A session key wins over server config. Someone supplied credentials for
  // this room expecting a real run; quietly giving them the scripted mock
  // instead would be the worse failure of the two.
  const real = session.apiKey !== null || process.env.RELAY_AGENT === "real";
  if (!real) {
    runMockAgent(session, instruction, () => onRunSettled(session));
    return;
  }
  void runRealAgent(session, instruction).then(() => onRunSettled(session));
}

// Runs once a turn ends — success, error, or abort. Starts the next queued
// instruction if the driver sent one while this run was in flight (see the
// instruct handler in ws.ts); this is also what makes the queue safe to run
// unattended, since only one run is ever in flight per session at a time.
// Skipped once the last participant has left: teardown already aborted the
// run and disposed the working dir, so there's nothing left to continue.
function onRunSettled(session: Session): void {
  if (liveParticipantCount(session) === 0) return;
  const next = session.instructionQueue.shift();
  if (next !== undefined) {
    setStatus(session, "working");
    runAgent(session, next);
  }
}

// The query options that put a session-supplied key into play, or null when
// there isn't one (the ordinary case: the host's own credentials, untouched).
//
// Returns null too if the helper script can't be written. Falling back to the
// host's credentials there would bill the wrong account behind a UI that says
// otherwise, so runAgent treats null as "can't honour this key" and runs the
// mock instead.
function sessionKeyOptions(
  session: Session,
): { env: Record<string, string | undefined>; settings: Settings } | null {
  if (!session.apiKey) return null;
  const helper = apiKeyHelperPath();
  if (!helper) return null;
  return {
    env: { ...process.env, [SESSION_KEY_ENV]: session.apiKey },
    // Inline settings, so this run is unaffected by whatever the host has in
    // its own settings files — appropriate for a run on someone else's
    // credentials, and it keeps the helper from being overridden.
    settings: { apiKeyHelper: helper },
  };
}

// TodoWrite's payload, defensively parsed. It arrives as untyped tool input,
// and a malformed one must degrade to "no plan" rather than throw inside the
// message loop and kill the run.
function planItems(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    if (typeof t.content !== "string") continue;
    const status =
      t.status === "in_progress" || t.status === "completed"
        ? t.status
        : "pending";
    out.push({
      content: t.content,
      status,
      activeForm: typeof t.activeForm === "string" ? t.activeForm : undefined,
    });
  }
  return out;
}

// Split into (verb, target) rather than one string so the ledger can align
// them as columns and the eye can scan down a column instead of parsing each
// line (DESIGN.md, ledger rule 3). The spec is explicit that raw tool args
// must not be dumped into the UI (§5) — anything bulky goes in collapsed
// detail instead.
function summarizeToolCall(
  tool: string,
  input: Record<string, unknown>,
  workingDir: string,
): { verb: string; target: string } {
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
      return { verb: "ran", target: clip(input.command, 120) };
    case "Read":
      return { verb: "read", target: rel(input.file_path) };
    case "Write":
      return { verb: "wrote", target: rel(input.file_path) };
    case "Edit":
      return { verb: "edited", target: rel(input.file_path) };
    case "NotebookEdit":
      return { verb: "edited", target: rel(input.notebook_path) };
    case "Glob":
      return { verb: "globbed", target: clip(input.pattern, 60) };
    case "Grep":
      return { verb: "grepped", target: clip(input.pattern, 60) };
    case "WebFetch":
      return { verb: "fetched", target: clip(input.url, 70) };
    case "WebSearch":
      return { verb: "searched", target: clip(input.query, 60) };
    case "Task":
      return { verb: "delegated", target: clip(input.description, 70) };
    case "TodoWrite": {
      // "updated its plan" said nothing. Name the step it just started, so
      // the ledger row carries the same information the plan strip does.
      const todos = planItems(input.todos);
      const active = todos.find((t) => t.status === "in_progress");
      const done = todos.filter((t) => t.status === "completed").length;
      if (active) {
        return { verb: "planned", target: active.activeForm ?? active.content };
      }
      if (todos.length && done === todos.length) {
        return { verb: "planned", target: "all steps complete" };
      }
      return {
        verb: "planned",
        target: todos.length ? `${todos.length} steps` : "updated its plan",
      };
    }
    default:
      return { verb: tool.toLowerCase(), target: "" };
  }
}

// Line-level diff for the expandable detail on an edit row. Written here
// rather than pulled from a package: the inputs are one Edit's old/new
// strings (small), and this avoids shipping a diff library to the browser —
// the ledger receives finished lines, not two blobs to diff client-side.
function lineDiff(oldStr: string, newStr: string): DiffLine[] {
  const a = oldStr.split("\n");
  const b = newStr.split("\n");

  // Guard against a pathological LCS table on a huge Write. Above this,
  // fall back to showing the change wholesale rather than hanging the run.
  if (a.length * b.length > 40_000) {
    return [
      ...a.map((text) => ({ op: "-" as const, text })),
      ...b.map((text) => ({ op: "+" as const, text })),
    ];
  }

  // Standard LCS table, then walk it backwards to emit the edit script.
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: " ", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ op: "-", text: a[i++] });
    } else {
      out.push({ op: "+", text: b[j++] });
    }
  }
  while (i < a.length) out.push({ op: "-", text: a[i++] });
  while (j < b.length) out.push({ op: "+", text: b[j++] });
  return out;
}

// What, if anything, is worth showing when a row is expanded. Only edits get
// a diff — a Read's contents are the agent's business, not the watcher's.
function detailForCall(
  tool: string,
  input: Record<string, unknown>,
  path: string,
): ToolDetail | undefined {
  if (tool === "Edit" && typeof input.old_string === "string" && typeof input.new_string === "string") {
    return { type: "diff", path, lines: lineDiff(input.old_string, input.new_string) };
  }
  if (tool === "Write" && typeof input.content === "string") {
    // A new file is all additions — that IS the diff, and it reads correctly
    // in the same renderer.
    return {
      type: "diff",
      path,
      lines: input.content.split("\n").map((text) => ({ op: "+" as const, text })),
    };
  }
  if (tool === "TodoWrite") {
    // The whole checklist rides along on the event. The client takes the
    // newest one as the session's current plan (see PlanItem in the
    // protocol), which is what makes it survive replay and late joins for
    // free — no separate plan message, no server-side plan state.
    const todos = planItems(input.todos);
    if (todos.length) return { type: "plan", todos };
  }
  return undefined;
}

// Tool results come back detached from the call, so keep enough context to
// render a meaningful result row.
type PendingTool = { tool: string; verb: string; target: string };

function resultText(content: unknown): string {
  return Array.isArray(content)
    ? content
        .map((b) =>
          b && typeof b === "object" && "text" in b ? String(b.text) : "",
        )
        .join(" ")
    : typeof content === "string"
      ? content
      : "";
}

// Phrasing the SDK writes for the model's benefit, not the watcher's. Left in,
// it surfaces as "File created successfully at: REPORT.md (file state is
// current in your…" — an internal aside truncated mid-sentence.
const SDK_ASIDES = [
  /\s*\(file state is current in your context[^)]*\)/gi,
  /\s*<system-reminder>[\s\S]*?<\/system-reminder>/gi,
];

// Per-tool result summaries. The generic "N lines" fallback told a watcher
// nothing on 12 of 13 rows in a real run (see RELAY_PRODUCTION_PLAN.md §A3).
function summarizeToolResult(
  tool: string,
  content: unknown,
  workingDir: string,
  ok: boolean,
): string {
  let text = resultText(content);
  for (const aside of SDK_ASIDES) text = text.replace(aside, "");

  // Server-side absolute paths are noise in the ledger (and leak the host's
  // directory layout) — show them relative to the repo root instead.
  const cleaned = text.split(`${workingDir}/`).join("").trim();
  const oneLine = cleaned.replace(/\s+/g, " ").trim();
  const lines = cleaned ? cleaned.split("\n") : [];
  const clip = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n)}…` : s);

  // A failure's reason is the whole point of the row — never flatten it to
  // a bare "failed" (spec §5, DESIGN.md ledger rule 7).
  if (!ok) return oneLine ? clip(oneLine, 90) : "failed";

  switch (tool) {
    case "Read":
      return lines.length ? `${lines.length} lines` : "empty";
    case "Write":
      return "written";
    case "Edit":
    case "NotebookEdit":
      return "applied";
    case "Bash": {
      if (!oneLine) return "no output";
      // One-line output is usually the answer itself; multi-line is bulk the
      // watcher can expand into.
      return lines.length > 1 ? `${lines.length} lines` : clip(oneLine);
    }
    case "Glob":
    case "Grep": {
      const n = lines.filter((l) => l.trim()).length;
      return n === 1 ? "1 match" : `${n} matches`;
    }
    case "TodoWrite":
      return "plan updated";
    default:
      if (!oneLine) return "done";
      return lines.length > 1 ? `${lines.length} lines` : clip(oneLine);
  }
}

async function runRealAgent(
  session: Session,
  instruction: string,
): Promise<void> {
  const abort = new AbortController();
  session.agentAbort = abort;

  const pending = new Map<string, PendingTool>();
  // Same reasoning as RELAY_AGENT above — read per-call, not frozen at
  // module load, so .env changes actually take effect.
  const model = process.env.RELAY_MODEL ?? "claude-haiku-4-5";

  try {
    // Clone lazily: a session that never gets an instruction never pays for it.
    session.workingDir ??= await prepareWorkingDir(session.id);
    const workingDir = session.workingDir;

    const q = query({
      prompt: instruction,
      options: {
        cwd: workingDir,
        model,
        abortController: abort,
        // Headless: there is no human to approve each tool call. Scoped to a
        // disposable per-session clone — never the source repo (see repo.ts).
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        // A key supplied for this session bills that person instead of the
        // host. It goes in via `apiKeyHelper`, NOT via ANTHROPIC_API_KEY —
        // see apiKeyHelper.ts, which documents the measurement showing that
        // the env var is silently ignored whenever the host has Claude Code
        // credentials of its own.
        //
        // `env` REPLACES the subprocess environment rather than merging with
        // it (the SDK's own types say so), so process.env has to be spread or
        // the agent loses PATH and HOME and never starts.
        ...(sessionKeyOptions(session) ?? {}),
        // Continue the same agent conversation across instructions, so
        // follow-ups are steering rather than a cold restart (spec §5).
        ...(session.agentSessionId ? { resume: session.agentSessionId } : {}),
      },
    });

    for await (const msg of q) {
      // Capture the SDK's session id so the next instruction can resume it.
      // Guarded on an actual change: the SDK repeats session_id on nearly
      // every message, and mirroring it to Postgres on each one would fire
      // an upsert per tool call instead of once per run.
      if ("session_id" in msg && msg.session_id && msg.session_id !== session.agentSessionId) {
        session.agentSessionId = msg.session_id;
        mirrorSessionMeta(session);
      }

      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            const text = block.text.trim();
            if (text) appendEvent(session, { kind: "agent_text", data: { text } });
          } else if (block.type === "tool_use") {
            const input = (block.input ?? {}) as Record<string, unknown>;
            const { verb, target } = summarizeToolCall(
              block.name,
              input,
              workingDir,
            );
            pending.set(block.id, { tool: block.name, verb, target });
            appendEvent(session, {
              kind: "tool_call",
              // `id` pairs this with its result so the ledger renders ONE row
              // per action; the row appears now, pending, and completes when
              // the result lands.
              data: {
                id: block.id,
                tool: block.name,
                verb,
                target,
                detail: detailForCall(block.name, input, target),
              },
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
            const ok = block.is_error !== true;
            const tool = call?.tool ?? "tool";
            const full = resultText(block.content).trim();
            appendEvent(session, {
              kind: "tool_result",
              data: {
                id: block.tool_use_id,
                tool,
                ok,
                summary: summarizeToolResult(tool, block.content, workingDir, ok),
                // Bulk output goes behind the disclosure rather than being
                // truncated away — the summary stays scannable, the detail
                // stays available.
                detail:
                  full.split("\n").length > 1
                    ? ({ type: "text", text: full.split(`${workingDir}/`).join("") } as const)
                    : undefined,
              },
            });
          }
        }
      } else if (msg.type === "result") {
        if (msg.subtype === "success") {
          // The SDK already carries run economics on the result message;
          // previously all of it was dropped and agent_done carried `{}`.
          appendEvent(session, {
            kind: "agent_done",
            data: {
              steps: msg.num_turns,
              durationMs: msg.duration_ms,
              costUsd: msg.total_cost_usd,
            },
          });
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
    // An abort is a deliberate stop, not a failure to report as one. Still
    // clear "working" so a driver who reconnects later isn't stuck watching
    // a status that will never resolve on its own.
    if (abort.signal.aborted) {
      setStatus(session, "idle");
      return;
    }
    // Redacted on the way in: an agent_error is appended to the transcript,
    // broadcast to the whole room, and mirrored to Postgres. A failed auth
    // that echoes the key back would otherwise put it in all three.
    appendEvent(session, {
      kind: "agent_error",
      data: {
        message: redactKeys(err instanceof Error ? err.message : String(err)),
      },
    });
    setStatus(session, "error");
  } finally {
    if (session.agentAbort === abort) session.agentAbort = null;
  }
}
