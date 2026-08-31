import type { DiffLine, ToolDetail } from "@relay/shared";
import { planItems } from "./summarize.js";

/**
 * Line-level diff for the expandable detail on an edit row.
 *
 * Hand-written rather than pulled from a package: the inputs are one Edit's
 * old/new strings, and this keeps a diff library out of the browser bundle —
 * the ledger receives finished lines, not two blobs to diff client-side.
 */
export function lineDiff(oldStr: string, newStr: string): DiffLine[] {
  const a = oldStr.split("\n");
  const b = newStr.split("\n");

  // Guard against a pathological LCS table on a huge Write. Above this, show
  // the change wholesale rather than hanging the run.
  if (a.length * b.length > 40_000) {
    return [
      ...a.map((text) => ({ op: "-" as const, text })),
      ...b.map((text) => ({ op: "+" as const, text })),
    ];
  }

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

// What, if anything, is worth showing when a row is expanded. Only edits get a
// diff — a Read's contents are the agent's business, not the watcher's.
export function detailForCall(
  tool: string,
  input: Record<string, unknown>,
  path: string,
): ToolDetail | undefined {
  if (
    tool === "Edit" &&
    typeof input.old_string === "string" &&
    typeof input.new_string === "string"
  ) {
    return { type: "diff", path, lines: lineDiff(input.old_string, input.new_string) };
  }
  if (tool === "Write" && typeof input.content === "string") {
    // A new file is all additions — that IS the diff, and it reads correctly in
    // the same renderer.
    return {
      type: "diff",
      path,
      lines: input.content.split("\n").map((text) => ({ op: "+" as const, text })),
    };
  }
  if (tool === "TodoWrite") {
    // The whole checklist rides along on the event. The client takes the newest
    // one as the session's current plan, which is what makes it survive replay
    // and late joins with no separate plan message and no server-side state.
    const todos = planItems(input.todos);
    if (todos.length) return { type: "plan", todos };
  }
  return undefined;
}
