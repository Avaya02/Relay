import type { CSSProperties } from "react";
import { Check, ChevronDown, Copy, FileCode2 } from "lucide-react";
import { PresenceAvatar } from "@/components/room/PresenceAvatar";
import { VerbIcon } from "@/components/stream/verbIcon";
import { activeLabel, histogram, type ActionRow } from "@/components/stream/rows";
import { FPS, prog, sec } from "../time";
import type { Person, Run, Step } from "../script";
import { Fold, Grow, breathe } from "./motion";
import { RUNS, finishAt, sentAt, stepAt } from "./state";

// In the shape the room's helpers read, so "Reading src/…" and "read 2 · edited 2"
// come from the session page's own code.
function asRow(step: Step, seq: number, settled: boolean): ActionRow {
  return {
    type: "action",
    call: { seq, ts: "", kind: "tool_call", data: { tool: step.verb, verb: step.verb, target: step.target } },
    result: settled ? { seq, ts: "", kind: "tool_result", data: { ok: true, summary: step.result } } : null,
  };
}

export function Transcript({ f, viewer }: { f: number; viewer: Person }) {
  const runs = RUNS.filter((run) => f >= sentAt(run));
  return (
    <div className="droom-stream">
      <div className="droom-measure">
        {runs.map((run, i) => (
          <Grow key={run.id} p={prog(f, sentAt(run), sec(0.34))} rise={10}>
            <section className="turn" style={i > 0 ? { paddingTop: 36 } : undefined}>
              <Prompt run={run} self={run.by.id === viewer.id} />
              <Activity f={f} run={run} />
              <Grow p={prog(f, finishAt(run) + sec(0.06), sec(0.4))} rise={8}>
                <Reply run={run} />
              </Grow>
            </section>
          </Grow>
        ))}
      </div>
    </div>
  );
}

function Prompt({ run, self }: { run: Run; self: boolean }) {
  return (
    <div className="prompt" style={{ "--hue": run.by.hue } as CSSProperties}>
      <div className="prompt-meta">
        <PresenceAvatar participant={{ displayName: run.by.name }} hue={run.by.hue} size="xs" />
        <span className="prompt-who">{self ? "You" : run.by.name}</span>
        <span className="prompt-time">{run.time}</span>
        <span className="prompt-turn">Turn {run.number}</span>
      </div>
      <p className="prompt-text">{run.text}</p>
    </div>
  );
}

// The room's StepsCard: a live list while the run works, folded to one line after.
function Activity({ f, run }: { f: number; run: Run }) {
  const finished = f >= finishAt(run);
  const steps = run.steps.filter((s) => f >= stepAt(run, s.at));
  const rows = steps.map((s, i) => asRow(s, i, f >= stepAt(run, s.done)));
  const n = rows.length;
  const label = `${n === 0 ? "Thinking" : activeLabel(rows)}…`;
  const entries = [
    ...steps.map((s) => ({ id: s.id, at: s.at, step: s, text: null as string | null })),
    ...run.notes.filter((x) => f >= stepAt(run, x.at)).map((x) => ({ id: x.id, at: x.at, step: null, text: x.text })),
  ].sort((a, b) => a.at - b.at);

  return (
    <div className="activity w-full text-sm" data-state={finished ? "closed" : "working"}>
      {finished ? (
        <span className="group flex h-7 min-w-0 items-center gap-1.5 rounded-md text-left font-medium text-muted-foreground">
          <span className="truncate">
            <span className="activity-count">
              {n} {n === 1 ? "step" : "steps"}
            </span>
            <span className="activity-shape">{histogram(rows)}</span>
            <span className="activity-meta">{run.took}</span>
          </span>
          <span className="inline-flex shrink-0 text-muted-foreground/70">
            <ChevronDown className="size-3.5" />
          </span>
        </span>
      ) : (
        <div role="status" className="flex h-7 min-w-0 items-center text-muted-foreground">
          <span className="inline-block font-medium activity-live" style={shimmer(f)}>
            {label}
          </span>
          {n > 0 && (
            <span className="activity-meta">
              {n} {n === 1 ? "step" : "steps"}
            </span>
          )}
        </div>
      )}
      <Fold p={1 - prog(f, finishAt(run), sec(0.16))}>
        <div className="pr-1">
          <div className="space-y-0.5 py-2 activity-list">
            {entries.map((e) => (
              <Grow key={e.id} p={prog(f, stepAt(run, e.at), sec(0.3))}>
                {e.step ? (
                  <StepRow step={e.step} f={f} settled={f >= stepAt(run, e.step.done)} />
                ) : (
                  <div className="step-note markdown-body">
                    <p>{e.text}</p>
                  </div>
                )}
              </Grow>
            ))}
          </div>
        </div>
      </Fold>
    </div>
  );
}

// The thinking shimmer's 1.8s sweep (lib/text-shimmer.ts), read from the frame.
function shimmer(f: number): CSSProperties {
  const t = ((f / FPS) % 1.8) / 1.8;
  return {
    backgroundImage:
      "linear-gradient(110deg, var(--muted-foreground) 30%, var(--foreground) 50%, var(--muted-foreground) 70%)",
    backgroundSize: "200% 100%",
    backgroundPosition: `${200 - 400 * t}% 0`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
}

function StepRow({ step, f, settled }: { step: Step; f: number; settled: boolean }) {
  return (
    <div className={`step step--${settled ? "ok" : "pending"}`}>
      <div className="step-row">
        <VerbIcon verb={step.verb} />
        <span className="step-verb">{step.verb}</span>
        <span className="step-target">{step.target}</span>
        <span className="step-result">{settled ? step.result : "working…"}</span>
        <span className="step-duration">{settled ? step.took : ""}</span>
        <span className="step-mark">
          {settled ? (
            <Check size={12} strokeWidth={2.25} />
          ) : (
            <span className="live-dot" style={{ opacity: breathe(f, FPS) }} />
          )}
        </span>
      </div>
    </div>
  );
}

// components/agents/code-block.tsx for a plain-text block: numbered from four
// lines, no syntax colour to strip from the landing's greys.
function CodeBlock({ lines }: { lines: string[] }) {
  return (
    <div className="codeblock w-full overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface text-sm">
      <div className="flex h-9 items-center gap-2.5 pl-3 pr-1.5">
        <FileCode2 className="size-3.5 shrink-0 text-text-faint" />
        <span className="font-mono text-[length:var(--fs-2xs)] text-text-faint">text</span>
        <span className="ml-auto grid size-7 shrink-0 place-items-center text-text-faint">
          <Copy className="size-3.5" />
        </span>
      </div>
      <div className="overflow-hidden border-t border-border py-2">
        <pre className="m-0 min-w-max font-mono text-xs leading-5 text-foreground/85">
          <code>
            {lines.map((line, i) => (
              <span key={line} className="grid min-h-5 grid-cols-[2.75rem_minmax(0,1fr)]">
                <span className="select-none pr-3 text-right tabular-nums text-text-faint">{i + 1}</span>
                <span className="whitespace-pre pl-1 pr-4">{line}</span>
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

// Backticks become code spans, as the room's markdown renders them.
function inline(text: string) {
  return text.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}

function Reply({ run }: { run: Run }) {
  return (
    <article className="answer">
      <div className="answer-part">
        <div className="markdown-body">
          {run.reply.lines.map((line) => (
            <p key={line}>{inline(line)}</p>
          ))}
          {run.reply.bullets && (
            <ul>
              {run.reply.bullets.map((line) => (
                <li key={line}>{inline(line)}</li>
              ))}
            </ul>
          )}
          {run.reply.code && <CodeBlock lines={run.reply.code} />}
          {run.reply.close && <p>{inline(run.reply.close)}</p>}
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center gap-0.5 answer-actions">
          <span className="grid size-7 place-items-center rounded-md text-muted-foreground">
            <Copy className="size-3.5" />
          </span>
          <div className="ml-auto min-w-0">
            <span className="turn-foot">
              <span>{run.took}</span>
              <span className="turn-foot-sep">·</span>
              <span>{run.doneAt}</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
