import { Check, X } from "lucide-react";
import { Enter, Reveal } from "../demo-room/motion";
import type { DemoStep, DemoTurn, Person } from "../demo-room/model";
import { Code, Typed, Words } from "./text";

const DONE: Record<string, string> = { read: "Read", wrote: "Wrote", edited: "Edited", ran: "Ran" };
const DOING: Record<string, string> = { read: "Reading", wrote: "Writing", edited: "Editing", ran: "Running" };

// The agent's work as a chain-of-thought rail: who asked, each step as it runs,
// then the answer. Sized to be read from across a room, not just scanned.
export function ThreadView({
  turns,
  people,
  selfId,
}: {
  turns: DemoTurn[];
  people: Person[];
  selfId: string;
}) {
  return (
    <>
      {turns.map((turn) => {
        const self = turn.by === selfId;
        const who = self ? "You" : (people.find((p) => p.id === turn.by)?.name ?? "");
        return (
          <Enter key={turn.id} className="lab-turn">
            <div className="lab-ask">
              <span className="lab-ask-who">{who}</span>
              <p className="lab-ask-text">{self ? <Typed text={turn.text} /> : turn.text}</p>
            </div>
            <div className="lab-rail">
              {turn.steps.map((step) => (
                <Enter key={step.id}>
                  <Step step={step} />
                </Enter>
              ))}
            </div>
            {turn.settled && (
              <Enter>
                <p className="lab-say">
                  <Words text={turn.settled.reply} />
                </p>
              </Enter>
            )}
          </Enter>
        );
      })}
    </>
  );
}

function Step({ step }: { step: DemoStep }) {
  const state = step.result === undefined ? "pending" : step.ok === false ? "fail" : "ok";
  // Tests are the one result worth a colour; everything else stays grey.
  const tone = step.verb === "ran" && state !== "pending" ? (state === "fail" ? "fail" : "pass") : undefined;
  return (
    <div className="lab-step" data-state={state}>
      <span className="lab-mark">
        {state === "pending" ? (
          <i className="lab-dot" />
        ) : state === "ok" ? (
          <Check size={13} strokeWidth={2.25} />
        ) : (
          <X size={13} strokeWidth={2.25} />
        )}
      </span>
      <span className="lab-verb">{state === "pending" ? DOING[step.verb] : DONE[step.verb]}</span>
      <span className="lab-chip">{step.target}</span>
      <span className="lab-result" data-tone={tone}>
        {step.result ?? ""}
      </span>
      {step.code && (
        <div className="lab-step-code">
          <Reveal open={state === "pending"}>
            <Code lines={step.code} />
          </Reveal>
        </div>
      )}
    </div>
  );
}
