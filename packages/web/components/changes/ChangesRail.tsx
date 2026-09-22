"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PanelRight, PanelRightClose } from "lucide-react";
import type { PublishState } from "@/lib/useSession";
import { CHANGES_WIDTH, useChangesWidth } from "@/lib/prefs";
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
}) {
  const [collapsed, setCollapsed] = useState(false);
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

  if (collapsed) {
    return (
      <aside className="changes changes--collapsed">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setCollapsed(false)}
          title="Show changes"
          aria-label={`Show changes — ${n} ${n === 1 ? "file" : "files"}`}
        >
          <PanelRight size={15} />
        </button>
        {n > 0 && <span className="rail-count">{n}</span>}
      </aside>
    );
  }

  return (
    <aside
      className={`changes${dragWidth !== null ? " changes--dragging" : ""}`}
      style={{ width }}
    >
      <button
        type="button"
        className="changes-resizer"
        onPointerDown={startDrag}
        onKeyDown={nudge}
        data-dragging={dragWidth !== null || undefined}
        aria-label="Resize changes panel"
        aria-valuenow={width}
        aria-valuemin={CHANGES_WIDTH.min}
        aria-valuemax={CHANGES_WIDTH.max}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
      />
      <div className="rail-head">
        <span className="rail-title">
          Changes
          {n > 0 && (
            <span className="rail-title-meta">
              {n} {n === 1 ? "file" : "files"}
              {/* Never claim a number that hasn't been measured: "+0 −0"
                  mid-run reads as "no changes", the opposite of the truth. */}
              {measured > 0 && (
                <>
                  {" · "}
                  <Stat kind="add" value={insertions} /> <Stat kind="del" value={deletions} />
                </>
              )}
            </span>
          )}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setCollapsed(true)}
          title="Hide changes"
          aria-label="Hide changes"
        >
          <PanelRightClose size={15} />
        </button>
      </div>

      <div className="rail-body">
        {n === 0 ? (
          <p className="rail-empty">Nothing touched yet. Files the agent writes appear here as it works.</p>
        ) : (
          <ul className="changes-list">
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
        <div className="changes-foot">
          {publishState && <PublishNote state={publishState} />}
          {canPublish && (
            <button
              type="button"
              className="changes-publish"
              disabled={publishing}
              onClick={() => onPublish(`Relay session — ${measured} files changed`)}
            >
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
      <span
        className={`changes-mark changes-mark--${file.status}`}
        title={STATUS_LABEL[file.status]}
        aria-hidden
      >
        {STATUS_MARK[file.status]}
      </span>
      <span className="changes-path" title={`${file.path}${turn ? ` · ${turn}` : ""}`}>
        {dir && <span className="changes-dir">{dir}</span>}
        <span className="changes-base">{base}</span>
      </span>
      {measured ? (
        <span className="changes-stats">
          <Stat kind="add" value={file.insertions} />
          <Stat kind="del" value={file.deletions} />
        </span>
      ) : (
        <span className="changes-pending" title={STATUS_LABEL.pending}>
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
          className="changes-row"
          onClick={onToggle}
          aria-pressed={selected}
          aria-label={`${STATUS_LABEL[file.status]} ${file.path}, +${file.insertions} −${file.deletions}. ${selected ? "Close" : "Open"} diff.`}
        >
          {label}
        </button>
      ) : (
        <div className="changes-row">{label}</div>
      )}
    </li>
  );
}

function Stat({ kind, value }: { kind: "add" | "del"; value: number }) {
  // A zero is not a deletion — colouring "−0" like one puts signal colour on
  // the absence of the thing it signals.
  const tone = value === 0 ? "stat--zero" : `stat--${kind}`;
  return (
    <span className={`stat ${tone}`}>
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
        <>
          {" · "}saved to the local mirror — set RELAY_GITHUB_REPO and RELAY_GITHUB_TOKEN to open a
          pull request
        </>
      )}
    </p>
  );
}
