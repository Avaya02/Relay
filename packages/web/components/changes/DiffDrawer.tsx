"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Patch } from "./Patch";
import { FileMark, Stat } from "./ChangesRail";
import type { ChangedFile } from "./derive";

export function DiffDrawer({ file, onClose }: { file: ChangedFile; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="rdrawer" role="dialog" aria-label={`Diff of ${file.path}`}>
      <div className="rdrawer-head">
        <FileMark status={file.status} />
        <span className="rdrawer-path" title={file.path}>
          {file.path}
        </span>
        <span className="crail-stats">
          <Stat kind="add" value={file.insertions} />
          <Stat kind="del" value={file.deletions} />
        </span>
        {file.turn !== null && <span className="rdrawer-turn">turn {file.turn}</span>}
        <button
          type="button"
          className="rbtn rbtn--icon rbtn--sm"
          onClick={onClose}
          aria-label="Close diff"
        >
          <X size={15} />
        </button>
      </div>
      <div className="rdrawer-body">{file.patch && <Patch patch={file.patch} />}</div>
    </div>
  );
}
