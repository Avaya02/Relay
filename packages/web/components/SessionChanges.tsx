"use client";

import { useState } from "react";
import type { PublishState, SessionChanges as Changes } from "@/lib/useSession";
import { Button } from "@/components/ui/button";

// What the session actually produced. Until this existed, a run's work
// evaporated when the working dir was disposed — the ledger showed that
// `src/App.tsx` was edited, but nobody could see the result or keep it.
//
// Collapsed by default: it sits quietly under the ledger until a run finishes,
// and never competes with the stream while the agent is still working.

export function SessionChanges({
  changes,
  isDriver,
  publishState,
  publishing,
  onPublish,
}: {
  changes: Changes | null;
  isDriver: boolean;
  publishState: PublishState | null;
  publishing: boolean;
  onPublish: (title: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // Nothing ran, or the agent only read things. Either way there's nothing to
  // show, and an empty "0 files changed" bar would be noise.
  if (!changes || changes.files.length === 0) return null;

  const n = changes.files.length;

  return (
    <div className="changes">
      <div className="changes-bar">
        <button
          type="button"
          className="changes-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="changes-chevron" aria-hidden>
            {open ? "⌄" : "›"}
          </span>
          <span className="changes-count">
            {n} {n === 1 ? "file" : "files"} changed
          </span>
          <Stat kind="add" value={changes.insertions} />
          <Stat kind="del" value={changes.deletions} />
        </button>

        {isDriver && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs"
            disabled={publishing}
            onClick={() => onPublish(`Relay session — ${n} files changed`)}
          >
            {publishing ? "Publishing…" : "Publish branch"}
          </Button>
        )}
      </div>

      {publishState && <PublishNote state={publishState} />}

      {open && (
        <div className="changes-panel">
          <ul className="changes-files">
            {changes.files.map((f) => (
              <li key={f.path}>
                <span className="changes-file-path">{f.path}</span>
                <Stat kind="add" value={f.insertions} />
                <Stat kind="del" value={f.deletions} />
              </li>
            ))}
          </ul>
          <Patch patch={changes.patch} />
        </div>
      )}
    </div>
  );
}

// A zero is not a deletion — colouring "−0" the same as a real deletion put
// signal colour on the absence of the thing it signals.
function Stat({ kind, value }: { kind: "add" | "del"; value: number }) {
  const tone = value === 0 ? "changes-zero" : `changes-${kind}`;
  return (
    <span className={`changes-stat ${tone}`}>
      {kind === "add" ? "+" : "−"}
      {value}
    </span>
  );
}

function PublishNote({ state }: { state: PublishState }) {
  if (!state.ok) {
    return <p className="changes-note changes-note--error">{state.error}</p>;
  }
  return (
    <p className="changes-note">
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
// readable review surface, not a merge tool.
function Patch({ patch }: { patch: string }) {
  if (!patch.trim()) return null;
  return (
    <pre className="changes-diff">
      {patch.split("\n").map((line, i) => {
        let cls = "diff-line";
        if (line.startsWith("diff --git") || line.startsWith("index ")) {
          cls = "diff-line diff-file";
        } else if (line.startsWith("+++") || line.startsWith("---")) {
          cls = "diff-line diff-file";
        } else if (line.startsWith("@@")) {
          cls = "diff-line diff-hunk";
        } else if (line.startsWith("+")) {
          cls = "diff-line diff-add";
        } else if (line.startsWith("-")) {
          cls = "diff-line diff-del";
        }
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
