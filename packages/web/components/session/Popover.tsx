"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * A trigger and a floating panel. Closes on outside click and on Escape —
 * both, not either: a popover that only closes one way is the kind of thing
 * that feels broken without anyone being able to say why.
 *
 * The trigger is rendered by the caller so it can be any button shape; it
 * receives the aria wiring and the toggle.
 */
export function Popover({
  trigger,
  children,
  align = "right",
  label,
  width,
}: {
  trigger: (props: {
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-controls": string;
    "aria-haspopup": "dialog";
  }) => ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  label: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="popover" ref={wrapRef}>
      {trigger({
        onClick: () => setOpen((v) => !v),
        "aria-expanded": open,
        "aria-controls": id,
        "aria-haspopup": "dialog",
      })}
      {open && (
        <div
          id={id}
          className={`popover-panel ${align === "left" ? "popover-panel--left" : ""}`}
          role="dialog"
          aria-label={label}
          style={width ? { width } : undefined}
        >
          {children}
        </div>
      )}
    </div>
  );
}
