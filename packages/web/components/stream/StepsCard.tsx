"use client";

import { useCallback, useState } from "react";
import { AgentActivity, type AgentActivityItem } from "@/components/agents/agent-activity";
import { ThinkingShimmer } from "@/components/agents/loading-states/thinking-shimmer";
import { DetailOpenCtx, FoldedSteps, StepRow } from "./StepRow";
import { NoteRow } from "./NoteRow";
import { activeLabel, fmtDuration, histogram, type ActionRow, type TraceEntry } from "./rows";

// About eight rows; past it a live run glides instead of shoving the transcript up.
const LIVE_WINDOW = 240;

function itemOf(entry: TraceEntry): AgentActivityItem {
  if (entry.kind === "note") {
    return { id: `n${entry.event.seq}`, type: "custom", content: <NoteRow event={entry.event} /> };
  }
  if (entry.kind === "single") {
    return { id: `s${entry.row.call.seq}`, type: "custom", content: <StepRow row={entry.row} /> };
  }
  return {
    id: `f${entry.rows[0].call.seq}`,
    type: "custom",
    content: <FoldedSteps verb={entry.verb} rows={entry.rows} />,
  };
}

export function StepsCard({
  trace,
  actions,
  live,
  durationMs,
  defaultOpen,
}: {
  trace: TraceEntry[];
  actions: ActionRow[];
  live: boolean;
  durationMs: number | null;
  defaultOpen: boolean;
}) {
  const [openDetails, setOpenDetails] = useState(0);
  const report = useCallback((delta: 1 | -1) => setOpenDetails((n) => n + delta), []);
  const n = actions.length;
  const shape = histogram(actions);
  const capped = live && openDetails === 0;

  return (
    <DetailOpenCtx.Provider value={report}>
      <AgentActivity
        className="activity"
        contentClassName="activity-list"
        items={trace.map(itemOf)}
        status={live ? "working" : "complete"}
        defaultOpen={defaultOpen}
        collapseOnComplete={!defaultOpen}
        maxHeight={capped ? LIVE_WINDOW : Number.MAX_SAFE_INTEGER}
        activeLabel={`${activeLabel(actions)}…`}
        renderWorkingStatus={({ label }) => (
          <>
            <ThinkingShimmer className="activity-live">{label}</ThinkingShimmer>
            {n > 0 && (
              <span className="activity-meta">
                {n} {n === 1 ? "step" : "steps"}
              </span>
            )}
          </>
        )}
        summary={
          <>
            <span className="activity-count">
              {n} {n === 1 ? "step" : "steps"}
            </span>
            {shape && <span className="activity-shape">{shape}</span>}
            {durationMs !== null && <span className="activity-meta">{fmtDuration(durationMs)}</span>}
          </>
        }
      />
    </DetailOpenCtx.Provider>
  );
}
