import type { CSSProperties } from "react";
import { Check, ChevronDown, Copy, X } from "lucide-react";
import type { Event } from "@relay/shared";
import { PresenceAvatar } from "@/components/room/PresenceAvatar";
import { VerbIcon } from "@/components/stream/verbIcon";
import { activeLabel, histogram, type ActionRow } from "@/components/stream/rows";
import { Enter, Reveal } from "./motion";
import type { DemoStep, DemoTurn, Person } from "./model";

// In the shape the room's own helpers read, so the live label ("Writing …") and
// the folded summary ("wrote 2 · read 1") come from the session page's code.
function asRow(step: DemoStep, seq: number): ActionRow {
  const tool = step.verb === "planned" ? "TodoWrite" : step.verb;
  const call: Event = { seq, ts: "", kind: "tool_call", data: { tool, verb: step.verb, target: step.target } };
  const result: Event | null =
    step.result === undefined
      ? null
      : { seq, ts: "", kind: "tool_result", data: { ok: step.ok !== false, summary: step.result } };
  return { type: "action", call, result };
}

export function DemoTranscript({
  turns,
  people,
  selfId,
}: {
  turns: DemoTurn[];
  people: Person[];
  selfId: string;
}) {
  return (
    <div className="droom-stream">
      <div className="droom-measure">
        {turns.map((turn) => {
          const by = people.find((p) => p.id === turn.by) ?? people[0];
          return (
            <Enter key={turn.id} className="droom-turn">
              <section className="turn">
                <Prompt turn={turn} by={by} self={turn.by === selfId} />
                <Steps turn={turn} />
                {turn.settled && (
                  <Enter>
                    <Reply took={turn.settled.took} at={turn.settled.at} text={turn.settled.reply} />
                  </Enter>
                )}
              </section>
            </Enter>
          );
        })}
      </div>
    </div>
  );
}

function Prompt({ turn, by, self }: { turn: DemoTurn; by: Person; self: boolean }) {
  return (
    <div className="prompt" style={{ "--hue": by.hue } as CSSProperties}>
      <div className="prompt-meta">
        <PresenceAvatar participant={{ displayName: by.name }} hue={by.hue} size="xs" />
        <span className="prompt-who">{self ? "You" : by.name}</span>
        <span className="prompt-time">{turn.at}</span>
        <span className="prompt-turn">Turn {turn.number}</span>
      </div>
      <p className="prompt-text">{turn.text}</p>
    </div>
  );
}

// The room's StepsCard: a live list while the run works, folded to a summary after.
function Steps({ turn }: { turn: DemoTurn }) {
  const rows = turn.steps.map(asRow);
  const n = rows.length;
  const steps = `${n} ${n === 1 ? "step" : "steps"}`;
  const shape = histogram(rows);

  return (
    <div className="activity w-full text-sm">
      {turn.settled ? (
        <button
          type="button"
          className="group flex h-7 min-w-0 items-center gap-1.5 rounded-md text-left font-medium text-muted-foreground"
        >
          <span className="truncate">
            <span className="activity-count">{steps}</span>
            {shape && <span className="activity-shape">{shape}</span>}
            <span className="activity-meta">{turn.settled.took}</span>
          </span>
          <span className="inline-flex shrink-0 text-muted-foreground/70">
            <ChevronDown className="size-3.5" />
          </span>
        </button>
      ) : (
        <div role="status" className="flex h-7 min-w-0 items-center text-muted-foreground">
          <span className="activity-live font-medium">{activeLabel(rows)}…</span>
          {n > 0 && <span className="activity-meta">{steps}</span>}
        </div>
      )}
      <Reveal open={!turn.settled}>
        <div className="activity-list space-y-0.5 py-2">
          {turn.steps.map((step) => (
            <Enter key={step.id}>
              <StepRow step={step} />
            </Enter>
          ))}
        </div>
      </Reveal>
    </div>
  );
}

function StepRow({ step }: { step: DemoStep }) {
  const state = step.result === undefined ? "pending" : step.ok === false ? "fail" : "ok";
  const planned = step.verb === "planned";
  return (
    <div className={`step step--${state}${planned ? " step--muted" : ""}`}>
      <div className="step-row">
        <VerbIcon verb={step.verb} />
        <span className="step-verb">{step.verb}</span>
        <span className="step-target">{step.target}</span>
        <span className="step-result">{step.result ?? "working…"}</span>
        <span className="step-duration">{step.took ?? ""}</span>
        <span className="step-mark">
          {state === "pending" ? (
            <span className="live-dot" />
          ) : state === "ok" ? (
            <Check size={12} strokeWidth={2.25} />
          ) : (
            <X size={12} strokeWidth={2.25} />
          )}
        </span>
      </div>
    </div>
  );
}

function Reply({ took, at, text }: { took: string; at: string; text: string }) {
  return (
    <article className="answer">
      <div className="answer-part">
        <div className="markdown-body">
          <p>{text}</p>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center gap-0.5 answer-actions">
          <span className="grid size-7 place-items-center rounded-md text-muted-foreground">
            <Copy className="size-3.5" />
          </span>
          <div className="ml-auto min-w-0">
            <span className="turn-foot">
              <span>{took}</span>
              <span className="turn-foot-sep">·</span>
              <span>{at}</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
