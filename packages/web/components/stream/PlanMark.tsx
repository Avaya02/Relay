import { Check, Circle } from "lucide-react";
import type { PlanItem } from "@relay/shared";

/** ✓ done, a live dot for the running step, an empty ring for the rest. */
export function PlanMark({ status }: { status: PlanItem["status"] }) {
  if (status === "completed") return <Check size={11} strokeWidth={2.25} aria-hidden />;
  if (status === "in_progress") return <span className="live-dot" aria-hidden />;
  return <Circle size={8} strokeWidth={2} aria-hidden />;
}
