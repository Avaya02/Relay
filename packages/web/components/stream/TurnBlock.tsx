"use client";

import type { Participant, SessionStatus } from "@relay/shared";
import { PromptBlock } from "./PromptBlock";
import { StepsCard } from "./StepsCard";
import { Reply } from "./Reply";
import { ErrorCard } from "./ErrorCard";
import { actionsOf, doneOf, splitTurn, timeOf, type Turn } from "./rows";

/**
 * One turn: what was asked, the work, what came back.
 *
 * The work is one activity record, with whatever the agent said mid-run kept
 * inside it at the point it was said. Which message is the reply is only
 * known once the run settles, so the reply leaves the record then, in the
 * same moment the record folds — the one move the layout makes.
 */
export function TurnBlock({
  turn,
  participants,
  selfId,
  status,
  runnerConnected,
  showSteps,
}: {
  turn: Turn;
  participants: Participant[];
  selfId: string | null;
  status: SessionStatus;
  runnerConnected: boolean;
  showSteps: boolean;
}) {
  const actions = actionsOf(turn);
  const done = doneOf(turn);
  const live = turn.live && !turn.queued && status === "working";
  const dropped = turn.queued && status !== "working";
  const error = turn.rows.find((r) => r.type === "error");
  const { trace, reply } = splitTurn(turn, live);

  const showCard = trace.length > 0 || live;
  const doneEvent = turn.rows.find((r) => r.type === "done")?.event;
  const meta = done && doneEvent && (
    <span className="turn-foot">
      {typeof done.durationMs === "number" && (
        <>
          <span>{(done.durationMs / 1000).toFixed(1)}s</span>
          <span className="turn-foot-sep">·</span>
        </>
      )}
      {typeof done.costUsd === "number" && (
        <>
          <span>${done.costUsd.toFixed(4)}</span>
          <span className="turn-foot-sep">·</span>
        </>
      )}
      <span>{timeOf(doneEvent)}</span>
    </span>
  );

  return (
    <section
      className={`turn${turn.queued ? " turn--queued" : ""}${live ? " turn--live" : ""}`}
      aria-label={turn.instruction ? `Turn ${turn.number}` : "Earlier in this session"}
    >
      {turn.instruction && (
        <PromptBlock
          event={turn.instruction}
          number={turn.number}
          participants={participants}
          selfId={selfId}
          queued={turn.queued && status === "working"}
          dropped={dropped}
        />
      )}

      {showCard && (
        <StepsCard
          trace={trace}
          actions={actions}
          live={live}
          durationMs={done?.durationMs ?? null}
          defaultOpen={showSteps}
        />
      )}

      {reply.length > 0 && <Reply events={reply} aside={meta} />}

      {error && (
        <ErrorCard
          seq={error.event.seq}
          message={String(error.event.data.message ?? "The agent stopped with an error.")}
          hint={
            runnerConnected
              ? "Send another instruction to continue."
              : "The runner is no longer connected. Start it again with npx relayrun."
          }
        />
      )}

      {meta && reply.length === 0 && <footer>{meta}</footer>}
    </section>
  );
}
