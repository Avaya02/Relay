import { Enter, Reveal } from "../demo-room/motion";
import type { DemoStep, DemoTurn, Person } from "../demo-room/model";
import { Code, Typed, Words } from "./text";

// The Agent SDK's own tool names, which is what the agent actually calls.
const TOOL: Record<string, string> = { read: "Read", wrote: "Write", edited: "Edit", ran: "Bash" };

// The same run as a terminal session: every line lands in order, and what a
// person types arrives a character at a time.
export function TerminalView({
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
        const who = self ? "you" : (people.find((p) => p.id === turn.by)?.name.toLowerCase() ?? "");
        return (
          <Enter key={turn.id} className="lab-turn">
            <div className="lab-tl lab-tl--ask">
              <span className="lab-tl-who">{who}</span>
              <span className="lab-tl-gt">›</span>
              <span className="lab-tl-text">{self ? <Typed text={turn.text} /> : turn.text}</span>
            </div>
            {turn.steps.map((step) => (
              <Enter key={step.id}>
                <Call step={step} />
              </Enter>
            ))}
            {turn.settled && (
              <Enter>
                <div className="lab-tl lab-tl--say">
                  <span className="lab-tl-bullet">●</span>
                  <span>
                    <Words text={turn.settled.reply} />
                  </span>
                </div>
              </Enter>
            )}
          </Enter>
        );
      })}
    </>
  );
}

function Call({ step }: { step: DemoStep }) {
  const pending = step.result === undefined;
  const tone = step.verb === "ran" && !pending ? (step.ok === false ? "fail" : "pass") : undefined;
  return (
    <div className="lab-call" data-state={pending ? "pending" : "done"}>
      <div className="lab-tl">
        <span className="lab-tl-bullet">●</span>
        <span>
          <b>{TOOL[step.verb]}</b>({step.target})
        </span>
      </div>
      {step.code && (
        <Reveal open={pending}>
          <Code lines={step.code} />
        </Reveal>
      )}
      {!pending && (
        <div className="lab-tl lab-tl--out" data-tone={tone}>
          <span className="lab-tl-elbow">└</span>
          <span>{step.result}</span>
        </div>
      )}
    </div>
  );
}
