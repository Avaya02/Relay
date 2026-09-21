import type { Event } from "@relay/shared";
import type { SessionChanges } from "@/lib/useSession";

// What the session did to the repo, from two sources at once:
//
//   live          — every Write/Edit the transcript has seen, the moment it
//                   lands. No line counts (nothing has measured them yet),
//                   but the path is known and that's the question asked.
//   authoritative — `git diff --numstat` from the runner when a turn settles,
//                   which supersedes the live guess with real counts, real
//                   add/modify/delete status, and a per-file patch.
//
// Deriving the live half from the transcript rather than tracking it as
// separate state is what makes the list correct for a late joiner and after
// a reconnect for free: both replay `history` through exactly this path.

const WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);

export type FileStatus = "added" | "modified" | "deleted" | "pending";

export type ChangedFile = {
  path: string;
  status: FileStatus;
  insertions: number;
  deletions: number;
  /** Which instruction turn first touched this file, 1-based. */
  turn: number | null;
  /** This file's section of the unified patch, once the runner has sent one. */
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
  pending: "written — not yet measured",
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

  // Path order, always. Recency would reshuffle the list under the reader's
  // cursor every time a row gets measured.
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
    // A demo transcript can start mid-turn, so floor at 1 rather than "turn 0".
    if (!turns.has(path)) turns.set(path, Math.max(turn, 1));
  }
  return turns;
}

// Paths come from the `+++ b/` / `--- a/` lines rather than the `diff --git`
// header, which is genuinely ambiguous for paths containing a space.
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
