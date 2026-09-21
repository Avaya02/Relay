"use client";

import { CircleAlert } from "lucide-react";
import { useIsNew } from "./newRows";

export function ErrorCard({ seq, message, hint }: { seq: number; message: string; hint: string }) {
  const isNew = useIsNew(seq);
  return (
    <div className="error-card" role="alert" data-new={isNew || undefined}>
      <CircleAlert size={15} aria-hidden />
      <p className="error-card-message">{message}</p>
      <p className="error-card-hint">{hint}</p>
    </div>
  );
}
