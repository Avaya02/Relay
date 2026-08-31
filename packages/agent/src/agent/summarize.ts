import path from "node:path";
import type { PlanItem } from "@relay/shared";

/**
 * TodoWrite's payload, defensively parsed. It arrives as untyped tool input,
 * and a malformed one must degrade to "no plan" rather than throw inside the
 * message loop and kill the run.
 */
export function planItems(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    if (typeof t.content !== "string") continue;
    const status =
      t.status === "in_progress" || t.status === "completed" ? t.status : "pending";
    out.push({
      content: t.content,
      status,
      activeForm: typeof t.activeForm === "string" ? t.activeForm : undefined,
    });
  }
  return out;
}

/**
 * Split into (verb, target) rather than one string so the ledger can align them
 * as columns and the eye can scan down a column instead of parsing each line
 * (DESIGN.md, ledger rule 3). Raw tool args must never be dumped into the UI —
 * anything bulky goes in collapsed detail instead.
 */
export function summarizeToolCall(
  tool: string,
  input: Record<string, unknown>,
  workingDir: string,
): { verb: string; target: string } {
  // Paths render relative to the repo root. An agent that guesses a path
  // outside the working dir would otherwise produce a "../../../.." chain, so
  // fall back to the bare filename in that case.
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
      // "updated its plan" said nothing. Name the step it just started, so the
      // ledger row carries the same information the plan strip does.
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

export function resultText(content: unknown): string {
  return Array.isArray(content)
    ? content
        .map((b) => (b && typeof b === "object" && "text" in b ? String(b.text) : ""))
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

/**
 * Per-tool result summaries. The generic "N lines" fallback told a watcher
 * nothing on 12 of 13 rows in a real run (RELAY_PRODUCTION_PLAN.md §A3).
 */
export function summarizeToolResult(
  tool: string,
  content: unknown,
  workingDir: string,
  ok: boolean,
): string {
  let text = resultText(content);
  for (const aside of SDK_ASIDES) text = text.replace(aside, "");

  // Absolute paths are noise in the ledger and leak the host's directory
  // layout — show them relative to the repo root instead.
  const cleaned = text.split(`${workingDir}/`).join("").trim();
  const oneLine = cleaned.replace(/\s+/g, " ").trim();
  const lines = cleaned ? cleaned.split("\n") : [];
  const clip = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n)}…` : s);

  // A failure's reason is the whole point of the row — never flatten it to a
  // bare "failed" (DESIGN.md ledger rule 7).
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
