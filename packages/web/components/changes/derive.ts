import type { Event } from "@relay/shared";
import type { SessionChanges } from "@/lib/useSession";

// Live (paths from the transcript, no counts) is superseded by the runner's git
// diff when a turn settles; deriving live from events serves late joiners free.
const WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);

export type FileStatus = "added" | "modified" | "deleted" | "pending";

export type ChangedFile = {
  path: string;
  status: FileStatus;
  insertions: number;
  deletions: number;
  // 1-based turn that first touched this file.
  turn: number | null;
  patch: string | null;
};

export const STATUS_MARK: Record<FileStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  pending: "·",
};

export const STATUS_LABEL: Record<FileStatus, string> = {
  added: "added",
  modified: "modified",
  deleted: "deleted",
  pending: "written, not yet measured",
};

export function changedFiles(events: Event[], changes: SessionChanges | null): ChangedFile[] {
  const turns = touchTurns(events);
  const patches = splitPatch(changes?.patch ?? "");
  const out: ChangedFile[] = [];
  const measured = new Set<string>();

  for (const file of changes?.files ?? []) {
    const section = patches.get(file.path);
    out.push({
      path: file.path,
      status: section?.status ?? "modified",
      insertions: file.insertions,
      deletions: file.deletions,
      turn: turns.get(file.path) ?? null,
      patch: section?.body ?? null,
    });
    measured.add(file.path);
  }

  for (const [path, turn] of turns) {
    if (measured.has(path)) continue;
    out.push({ path, status: "pending", insertions: 0, deletions: 0, turn, patch: null });
  }

  // Path order: recency would reshuffle the list under the reader as rows get measured.
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function touchTurns(events: Event[]): Map<string, number> {
  const turns = new Map<string, number>();
  let turn = 0;
  for (const event of events) {
    if (event.kind === "user_instruction") {
      turn++;
      continue;
    }
    if (event.kind !== "tool_call") continue;
    const data = event.data as { tool?: string; target?: string };
    if (!WRITE_TOOLS.has(data.tool ?? "")) continue;
    const path = (data.target ?? "").trim();
    if (!path) continue;
    // A demo transcript can start mid-turn; floor at 1.
    if (!turns.has(path)) turns.set(path, Math.max(turn, 1));
  }
  return turns;
}

// Paths come from the `+++`/`---` lines; the `diff --git` header is ambiguous for spaces.
function splitPatch(patch: string): Map<string, { status: FileStatus; body: string }> {
  const out = new Map<string, { status: FileStatus; body: string }>();
  if (!patch.trim()) return out;

  for (const chunk of patch.split(/^diff --git /m)) {
    if (!chunk.trim()) continue;
    const body = `diff --git ${chunk}`.trimEnd();
    const added = /^--- \/dev\/null$/m.test(chunk);
    const deleted = /^\+\+\+ \/dev\/null$/m.test(chunk);
    const toPath = /^\+\+\+ b\/(.+)$/m.exec(chunk)?.[1];
    const fromPath = /^--- a\/(.+)$/m.exec(chunk)?.[1];
    const path = (toPath ?? fromPath)?.trim();
    if (!path) continue;
    out.set(path, { status: added ? "added" : deleted ? "deleted" : "modified", body });
  }
  return out;
}

export function splitPath(path: string): { dir: string; base: string } {
  const cut = path.lastIndexOf("/");
  if (cut === -1) return { dir: "", base: path };
  return { dir: path.slice(0, cut + 1), base: path.slice(cut + 1) };
}
