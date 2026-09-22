"use client";

import type { Participant, SessionStatus } from "@relay/shared";
import { PromptBlock } from "./PromptBlock";
import { StepsCard } from "./StepsCard";
import { Answer } from "./Answer";
import { ErrorCard } from "./ErrorCard";
import { actionsOf, doneOf, timeOf, type Turn } from "./rows";

/**
 * One turn: what was asked, the steps, what came back.
 *
 * Row order is kept — an answer the agent gave *between* tool calls stays
 * between them — but all actions render inside one steps card, so the turn
 * reads as prompt → work → answer rather than as a log with prose in it.
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
  const pendingAction = actions.some((a) => !a.result);
  const texts = turn.rows.filter((r) => r.type === "text");
  const error = turn.rows.find((r) => r.type === "error");

  // Text that arrived after the last action is the reply; text before it is
  // the agent narrating mid-run. Both are answers, but only the tail should
  // sit below the steps card.
  const lastActionSeq = actions.length ? actions[actions.length - 1].call.seq : -1;
  const narration = texts.filter((t) => t.event.seq < lastActionSeq);
  const reply = texts.filter((t) => t.event.seq >= lastActionSeq);

  const showCard = actions.length > 0 || live;

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

      {narration.map((t) => (
        <Answer key={t.event.seq} seq={t.event.seq} text={String(t.event.data.text ?? "")} />
      ))}

      {showCard && (
        <StepsCard
          actions={actions}
          live={live}
          working={live && !pendingAction}
          durationMs={done?.durationMs ?? null}
          defaultOpen={showSteps}
        />
      )}

      {reply.map((t) => (
        <Answer key={t.event.seq} seq={t.event.seq} text={String(t.event.data.text ?? "")} />
      ))}

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

      {done && (
        <footer className="turn-foot">
          {typeof done.steps === "number" && (
            <>
              <span>
                {done.steps} {done.steps === 1 ? "step" : "steps"}
              </span>
              <span className="turn-foot-sep">·</span>
            </>
          )}
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
          <span>{timeOf(turn.rows.find((r) => r.type === "done")!.event)}</span>
        </footer>
      )}
    </section>
  );
}
