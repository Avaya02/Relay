"use client";

import { Check, Link2 } from "lucide-react";
import { useCopy } from "@/components/session/useCopy";

export function InviteButton({ variant = "ghost" }: { variant?: "ghost" | "secondary" }) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      className={`rbtn rbtn--${variant} rbtn--sm`}
      onClick={() => copy(window.location.href)}
      data-copied={copied || undefined}
    >
      {copied ? <Check size={13} aria-hidden /> : <Link2 size={13} aria-hidden />}
      {copied ? "Link copied" : "Invite someone"}
    </button>
  );
}
