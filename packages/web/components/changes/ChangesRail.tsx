"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowUpRight, FileDiff, GitPullRequest, PanelRightClose } from "lucide-react";
import type { PublishState } from "@/lib/useSession";
import { CHANGES_WIDTH, useChangesWidth } from "@/lib/prefs";
import { Tip } from "@/components/room/pop";
import { STATUS_LABEL, STATUS_MARK, splitPath, type ChangedFile } from "./derive";

/**
 * What the session did to the repo, standing rather than summoned. Rows are
 * plain until the runner has measured them — a button that opens nothing is
 * worse than no button — and a measured row opens its patch in the drawer.
 */
export function ChangesRail({
  files,
  measured,
  insertions,
  deletions,
  selectedPath,
  onSelect,
  canPublish,
  publishState,
  publishing,
  onPublish,
  onClose,
}: {
  files: ChangedFile[];
  /** How many rows carry real numbers. Zero means every row is a live guess. */
  measured: number;
  insertions: number;
  deletions: number;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  canPublish: boolean;
  publishState: PublishState | null;
  publishing: boolean;
  onPublish: (title: string) => void;
  onClose: () => void;
}) {
  const [savedWidth, saveWidth] = useChangesWidth();
  // Live width while dragging, committed to storage on release so a drag
  // doesn't write localStorage on every pointer move.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? savedWidth;
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const n = files.length;

  useEffect(() => {
    if (!drag.current) return;
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      // The rail hangs off the right edge, so dragging left makes it wider.
      const next = drag.current.startWidth + (drag.current.startX - e.clientX);
      setDragWidth(Math.min(CHANGES_WIDTH.max, Math.max(CHANGES_WIDTH.min, next)));
    };
    const onUp = () => {
      const w = drag.current ? (dragWidth ?? drag.current.startWidth) : null;
      drag.current = null;
      if (w !== null) saveWidth(w);
      setDragWidth(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragWidth, saveWidth]);

  function startDrag(e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    drag.current = { startX: e.clientX, startWidth: width };
    setDragWidth(width);
  }

  function nudge(e: React.KeyboardEvent<HTMLButtonElement>) {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === "ArrowLeft") saveWidth(width + step);
    else if (e.key === "ArrowRight") saveWidth(width - step);
    else return;
    e.preventDefault();
  }

  return (
    <aside
      className="crail"
      data-dragging={dragWidth !== null || undefined}
      style={{ width }}
      aria-label="Changes"
    >
      <button
        type="button"
        className="crail-resizer"
        onPointerDown={startDrag}
        onKeyDown={nudge}
        aria-label="Resize changes panel"
        aria-valuenow={width}
        aria-valuemin={CHANGES_WIDTH.min}
        aria-valuemax={CHANGES_WIDTH.max}
        role="separator"
        aria-orientation="vertical"
      />
      <div className="crail-head">
        <h2 className="crail-title">Changes</h2>
        {n > 0 && <span className="count">{n}</span>}
        {/* Never claim a number that hasn't been measured: "+0 −0" mid-run
            reads as "no changes", the opposite of the truth. */}
        {measured > 0 && (
          <span className="crail-sum">
            <Stat kind="add" value={insertions} />
            <Stat kind="del" value={deletions} />
          </span>
        )}
        <Tip label="Hide changes">
          <button
            type="button"
            className="rbtn rbtn--icon rbtn--sm crail-close"
            onClick={onClose}
            aria-label="Hide changes"
          >
            <PanelRightClose size={15} />
          </button>
        </Tip>
      </div>

      <div className="crail-body">
        {n === 0 ? (
          <div className="crail-empty">
            <FileDiff size={18} aria-hidden />
            <p>
              <b>No changes yet</b>
              Files the agent writes appear here as it works, each with its diff.
            </p>
          </div>
        ) : (
          <ul className="crail-list">
            {files.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                selected={selectedPath === file.path}
                onToggle={() => onSelect(selectedPath === file.path ? null : file.path)}
              />
            ))}
          </ul>
        )}
      </div>

      {(publishState || canPublish) && (
        <div className="crail-foot">
          {publishState && <PublishNote state={publishState} />}
          {canPublish && (
            <button
              type="button"
              className="rbtn rbtn--primary crail-publish"
              disabled={publishing}
              onClick={() => onPublish(`Relay session: ${measured} files changed`)}
            >
              <GitPullRequest size={14} aria-hidden />
              {publishing ? "Publishing…" : "Publish branch"}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function FileRow({
  file,
  selected,
  onToggle,
}: {
  file: ChangedFile;
  selected: boolean;
  onToggle: () => void;
}) {
  const { dir, base } = splitPath(file.path);
  const measured = file.status !== "pending";
  const turn = file.turn !== null ? `turn ${file.turn}` : "";

  const label = (
    <>
      <FileMark status={file.status} />
      <span className="crail-path" title={`${file.path}${turn ? ` · ${turn}` : ""}`}>
        {dir && <span className="crail-dir">{dir}</span>}
        <span className="crail-base">{base}</span>
      </span>
      {measured ? (
        <span className="crail-stats">
          <Stat kind="add" value={file.insertions} />
          <Stat kind="del" value={file.deletions} />
        </span>
      ) : (
        <span className="crail-pending" title={STATUS_LABEL.pending}>
          written
        </span>
      )}
    </>
  );

  return (
    <li>
      {file.patch ? (
        <button
          type="button"
          className="crail-row"
          onClick={onToggle}
          aria-pressed={selected}
          aria-label={`${STATUS_LABEL[file.status]} ${file.path}, +${file.insertions} −${file.deletions}. ${selected ? "Close" : "Open"} diff.`}
        >
          {label}
        </button>
      ) : (
        <div className="crail-row">{label}</div>
      )}
    </li>
  );
}

export function FileMark({ status }: { status: ChangedFile["status"] }) {
  return (
    <span className="fmark" data-status={status} title={STATUS_LABEL[status]} aria-hidden>
      {STATUS_MARK[status]}
    </span>
  );
}

export function Stat({ kind, value }: { kind: "add" | "del"; value: number }) {
  // A zero is not a deletion — colouring "−0" like one puts signal colour on
  // the absence of the thing it signals.
  return (
    <span className="stat" data-kind={value === 0 ? "zero" : kind}>
      {kind === "add" ? "+" : "−"}
      {value}
    </span>
  );
}

function PublishNote({ state }: { state: PublishState }) {
  if (!state.ok) {
    return <p className="crail-note crail-note--error">{state.error}</p>;
  }
  return (
    <p className="crail-note">
      Committed to <code>{state.branch}</code>
      {state.prUrl ? (
        <>
          {" · "}
          <a href={state.prUrl} target="_blank" rel="noreferrer">
            View pull request <ArrowUpRight size={12} aria-hidden />
          </a>
        </>
      ) : state.pushed ? (
        <> · pushed{state.note ? ` (${state.note})` : ""}</>
      ) : (
        <>
          {" · "}saved to the local mirror. Set RELAY_GITHUB_REPO and RELAY_GITHUB_TOKEN to open a
          pull request
        </>
      )}
    </p>
  );
}
