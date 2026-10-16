import type { CSSProperties } from "react";
import { ChevronDown, ListChecks } from "lucide-react";
import type { DemoPlan } from "./model";

// The room's PlanStrip, collapsed; its in-progress segment is in the driver's hue.
export function DemoPlanBar({ plan }: { plan: DemoPlan }) {
  const n = plan.steps.length;
  const allDone = plan.done === n;
  const active = plan.active ? plan.steps[plan.done] : null;
  const label = active ? active.doing : allDone ? "All steps complete" : "Waiting to start";

  return (
    <div className="rplan" data-complete={allDone || undefined}>
      <div className="rplan-bar">
        <ListChecks size={14} className="rplan-icon" />
        <span className="rplan-label">Plan</span>
        <span className="rplan-track" style={{ "--n": n } as CSSProperties}>
          {plan.steps.map((_, i) => (
            <span
              key={i}
              className="rplan-seg"
              data-status={i < plan.done ? "completed" : i === plan.done && plan.active ? "in_progress" : "pending"}
            />
          ))}
        </span>
        <span className="rplan-now" data-active={active ? true : undefined}>
          {label}
        </span>
        <span className="rplan-count">
          {plan.done}/{n}
        </span>
        <ChevronDown size={14} className="rplan-chevron" />
      </div>
    </div>
  );
}
