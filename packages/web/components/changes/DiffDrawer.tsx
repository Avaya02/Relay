"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Patch } from "./Patch";
import { STATUS_LABEL, STATUS_MARK, type ChangedFile } from "./derive";

/**
 * One file's patch, over the stream. A 20rem rail can't show a line of real
 * code; this can, and it closes on Escape, on its own button, or by clicking
 * the same row again.
 */
export function DiffDrawer({ file, onClose }: { file: ChangedFile; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer" role="dialog" aria-label={`Diff of ${file.path}`}>
      <div className="drawer-head">
        <span className={`changes-mark changes-mark--${file.status}`} title={STATUS_LABEL[file.status]}>
          {STATUS_MARK[file.status]}
        </span>
        <span className="drawer-path" title={file.path}>
          {file.path}
        </span>
        <span className="changes-stats">
          <span className={`stat ${file.insertions ? "stat--add" : "stat--zero"}`}>+{file.insertions}</span>
          <span className={`stat ${file.deletions ? "stat--del" : "stat--zero"}`}>−{file.deletions}</span>
        </span>
        {file.turn !== null && <span className="rail-title-meta">turn {file.turn}</span>}
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close diff">
          <X size={15} />
        </button>
      </div>
      <div className="drawer-body">{file.patch && <Patch patch={file.patch} />}</div>
    </div>
  );
}
