import type { DiffLine, ToolDetail } from "@relay/shared";
import { planItems } from "./summarize.js";

export function lineDiff(oldStr: string, newStr: string): DiffLine[] {
  const a = oldStr.split("\n");
  const b = newStr.split("\n");

  // Bounds the LCS table on a huge Write; past it, show the change wholesale.
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
    return {
      type: "diff",
      path,
      lines: input.content.split("\n").map((text) => ({ op: "+" as const, text })),
    };
  }
  if (tool === "TodoWrite") {
    // The full checklist rides on the event so the plan survives replay and late
    // joins without server-side state.
    const todos = planItems(input.todos);
    if (todos.length) return { type: "plan", todos };
  }
  return undefined;
}
