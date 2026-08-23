"use client";

import { useMemo, useState } from "react";
import type { Event } from "@relay/shared";
import type { PublishState, SessionChanges } from "@/lib/useSession";
import { Button } from "@/components/ui/button";

// WORKSPACE — what the session has done to the repo, standing rather than
// summoned.
//
// The changes panel this replaces was a collapsed bar under the ledger that
// only appeared once a run finished. Three things were wrong with that: you
// had to know to look for it, a file's diff was buried inside one giant
// `<pre>` of the whole patch, and while the agent was mid-run there was no
// answer at all to "what has it touched so far?".
//
// So the rail is built from two sources at once:
//
//   live          — every Write/Edit the ledger has seen, the moment it lands.
//                   No line counts (nothing has measured them yet), but the
//                   path is known and that's the question being asked.
//   authoritative — `git diff --numstat` from the server when a turn settles,
//                   which supersedes the live guess with real counts, real
//                   add/modify/delete status, and a per-file patch.
//
// Deriving the live half from the transcript rather than tracking it as
// separate state is the same trick the plan strip uses: it makes the rail
// correct for a late joiner and after a reconnect for free, because both
// replay `history` through exactly this path.

const WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);

type FileStatus = "added" | "modified" | "deleted" | "pending";

type WorkspaceFile = {
  path: string;
  status: FileStatus;
  insertions: number;
  deletions: number;
  /** Which instruction turn first touched this file, 1-based. */
  turn: number | null;
  /** This file's section of the unified patch, once the server has sent one. */
  patch: string | null;
};

const STATUS_MARK: Record<FileStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  pending: "·",
};

const STATUS_LABEL: Record<FileStatus, string> = {
  added: "added",
  modified: "modified",
  deleted: "deleted",
  pending: "written — not yet measured",
};

export function WorkspaceRail({
  events,
  changes,
  isDriver,
  publishState,
  publishing,
  onPublish,
}: {
  events: Event[];
  changes: SessionChanges | null;
  isDriver: boolean;
  publishState: PublishState | null;
  publishing: boolean;
  onPublish: (title: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [openPath, setOpenPath] = useState<string | null>(null);

  const files = useMemo(() => workspaceFiles(events, changes), [events, changes]);
  const insertions = changes?.insertions ?? 0;
  const deletions = changes?.deletions ?? 0;
  const n = files.length;
  // Nothing has been diffed yet — every row is a live guess. Line counts and
  // the publish button both depend on a measurement, so neither is offered
  // until one exists: "+0 −0" mid-run reads as "no changes", which is the
  // opposite of what's happening.
  const measured = changes?.files.length ?? 0;

  if (collapsed) {
    return (
      <aside className="workspace workspace--collapsed">
        <button
          type="button"
          className="workspace-expand"
          onClick={() => setCollapsed(false)}
          title="Show workspace"
          aria-label={`Show workspace — ${n} ${n === 1 ? "file" : "files"}`}
        >
          <span className="workspace-expand-chevron" aria-hidden>
            ‹
          </span>
          {n > 0 && <span className="workspace-expand-count">{n}</span>}
        </button>
      </aside>
    );
  }

  return (
    <aside className="workspace">
      <div className="workspace-head">
        <span className="workspace-title">Workspace</span>
        <button
          type="button"
          className="workspace-collapse"
          onClick={() => setCollapsed(true)}
          title="Hide workspace"
          aria-label="Hide workspace"
        >
          ›
        </button>
      </div>

      {n > 0 && (
        <div className="workspace-summary">
          <span className="workspace-count">
            {n} {n === 1 ? "file" : "files"}
          </span>
          {measured > 0 && (
            <>
              <Stat kind="add" value={insertions} />
              <Stat kind="del" value={deletions} />
            </>
          )}
        </div>
      )}

      <div className="workspace-body">
        {n === 0 ? (
          <p className="workspace-empty">
            Nothing touched yet. Files the agent writes appear here as it works.
          </p>
        ) : (
          <ul className="workspace-files">
            {files.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                open={openPath === file.path}
                onToggle={() =>
                  setOpenPath((p) => (p === file.path ? null : file.path))
                }
              />
            ))}
          </ul>
        )}
      </div>

      {(publishState || (isDriver && measured > 0)) && (
        <div className="workspace-foot">
          {publishState && <PublishNote state={publishState} />}
          {isDriver && measured > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-full text-xs"
              disabled={publishing}
              onClick={() =>
                onPublish(`Relay session — ${measured} files changed`)
              }
            >
              {publishing ? "Publishing…" : "Publish branch"}
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}

// A file row is only expandable once there's a patch to expand into. While a
// run is still in flight a row is a plain <li> rather than a dead button —
// an affordance that does nothing on click is worse than no affordance.
function FileRow({
  file,
  open,
  onToggle,
}: {
  file: WorkspaceFile;
  open: boolean;
  onToggle: () => void;
}) {
  const { dir, base } = splitPath(file.path);
  const measured = file.status !== "pending";

  const label = (
    <>
      <span
        className={`workspace-mark workspace-mark--${file.status}`}
        title={STATUS_LABEL[file.status]}
        aria-hidden
      >
        {STATUS_MARK[file.status]}
      </span>
      <span className="workspace-path" title={file.path}>
        {dir && <span className="workspace-dir">{dir}</span>}
        <span className="workspace-base">{base}</span>
      </span>
      {measured ? (
        <span className="workspace-stats">
          <Stat kind="add" value={file.insertions} />
          <Stat kind="del" value={file.deletions} />
        </span>
      ) : (
        <span className="workspace-pending" title={STATUS_LABEL.pending}>
          writing
        </span>
      )}
    </>
  );

  return (
    <li className="workspace-file">
      {file.patch ? (
        <button
          type="button"
          className="workspace-file-row workspace-file-row--open"
          onClick={onToggle}
          aria-expanded={open}
        >
          {label}
        </button>
      ) : (
        <div className="workspace-file-row">{label}</div>
      )}

      {file.turn !== null && (
        <span className="workspace-turn">turn {file.turn}</span>
      )}

      {open && file.patch && <Patch patch={file.patch} />}
    </li>
  );
}

function Stat({ kind, value }: { kind: "add" | "del"; value: number }) {
  // A zero is not a deletion — colouring "−0" like a real deletion puts signal
  // colour on the absence of the thing it signals.
  const tone = value === 0 ? "workspace-zero" : `workspace-${kind}`;
  return (
    <span className={`workspace-stat ${tone}`}>
      {kind === "add" ? "+" : "−"}
      {value}
    </span>
  );
}

function PublishNote({ state }: { state: PublishState }) {
  if (!state.ok) {
    return <p className="workspace-note workspace-note--error">{state.error}</p>;
  }
  return (
    <p className="workspace-note">
      Committed to <code>{state.branch}</code>
      {state.prUrl ? (
        <>
          {" · "}
          <a href={state.prUrl} target="_blank" rel="noreferrer">
            view pull request ↗
          </a>
        </>
      ) : state.pushed ? (
        <> · pushed{state.note ? ` — ${state.note}` : ""}</>
      ) : (
        // Honest about the unconfigured case rather than implying failure —
        // the branch is real and durable, it just hasn't left this machine.
        <>
          {" · "}saved to the local mirror — set RELAY_GITHUB_REPO and
          RELAY_GITHUB_TOKEN to open a pull request
        </>
      )}
    </p>
  );
}

// Minimal unified-diff renderer. The patch arrives as text from `git diff`, so
// colour it by line prefix rather than parsing hunks properly — the goal is a
// readable review surface, not a merge tool. The `diff --git`/`index` preamble
// is dropped: the row above already names the file and its status.
function Patch({ patch }: { patch: string }) {
  const lines = patch.split("\n").filter(
    (line) =>
      !line.startsWith("diff --git ") &&
      !line.startsWith("index ") &&
      !line.startsWith("new file mode ") &&
      !line.startsWith("deleted file mode ") &&
      !line.startsWith("--- ") &&
      !line.startsWith("+++ "),
  );

  return (
    <pre className="workspace-diff">
      {lines.map((line, i) => {
        let cls = "diff-line";
        if (line.startsWith("@@")) cls = "diff-line diff-hunk";
        else if (line.startsWith("+")) cls = "diff-line diff-add";
        else if (line.startsWith("-")) cls = "diff-line diff-del";
        return (
          <span key={i} className={cls}>
            {line || " "}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}

// --- derivation -----------------------------------------------------------

function workspaceFiles(
  events: Event[],
  changes: SessionChanges | null,
): WorkspaceFile[] {
  const turns = touchTurns(events);
  const patches = splitPatch(changes?.patch ?? "");
  const out: WorkspaceFile[] = [];
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

  // The live half: written this turn, not yet in a numstat. Once the run
  // settles these are replaced by the measured rows above.
  for (const [path, turn] of turns) {
    if (measured.has(path)) continue;
    out.push({
      path,
      status: "pending",
      insertions: 0,
      deletions: 0,
      turn,
      patch: null,
    });
  }

  // One stable order for both halves. Sorting by recency would be more
  // useful for a second, then reshuffle the list under the reader's cursor
  // every time a row is measured — path order stays put.
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// First turn that touched each path. `user_instruction` events are the turn
// boundaries, so counting them while walking the transcript gives a number
// that means the same thing to everyone in the room.
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
    // A demo session's transcript can start mid-turn (bootstrapDemoSession),
    // so floor at 1 rather than reporting "turn 0".
    if (!turns.has(path)) turns.set(path, Math.max(turn, 1));
  }

  return turns;
}

// Split a unified patch into per-file sections. Paths come from the `+++ b/`
// and `--- a/` lines rather than the `diff --git a/x b/x` header, because that
// header is genuinely ambiguous for paths containing a space.
function splitPatch(
  patch: string,
): Map<string, { status: FileStatus; body: string }> {
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

    out.set(path, {
      status: added ? "added" : deleted ? "deleted" : "modified",
      body,
    });
  }

  return out;
}

function splitPath(path: string): { dir: string; base: string } {
  const cut = path.lastIndexOf("/");
  if (cut === -1) return { dir: "", base: path };
  return { dir: path.slice(0, cut + 1), base: path.slice(cut + 1) };
}
