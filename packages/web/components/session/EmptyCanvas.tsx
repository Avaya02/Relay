"use client";

import { ArrowUpRight, Check, Copy } from "lucide-react";
import type { AgentInfo, Participant } from "@relay/shared";
import { Avatar } from "@/components/Presence";
import { RunnerCommand, agentLabel } from "./SessionDetails";
import { useCopy } from "./useCopy";

// Repo-agnostic on purpose: these are the first three things anyone asks of
// an agent in a codebase they're about to watch it work in.
const EXAMPLES = [
  "Summarize what this repository does and how it's laid out",
  "Find the three largest source files and suggest how to split them",
  "Run the test suite and report what fails and why",
];

/**
 * Before the first instruction: what's attached, who's here, what to try.
 * An invitation, not a mood — and one that changes with the viewer's role,
 * since a watcher can't act on "type an instruction".
 */
export function EmptyCanvas({
  repo,
  agent,
  participants,
  driverId,
  selfId,
  isDriver,
  onExample,
}: {
  repo: string | null;
  agent: AgentInfo | null;
  participants: Participant[];
  driverId: string | null;
  selfId: string | null;
  isDriver: boolean;
  onExample: (text: string) => void;
}) {
  const { copied, copy } = useCopy();
  const offline = !agent || !agent.runnerConnected;
  const driver = participants.find((p) => p.id === driverId) ?? null;
  const others = participants.filter((p) => p.id !== selfId);

  const lede = isDriver
    ? "Everyone with the link watches the same run, live. You're driving. What you send below runs on the host's machine and streams here step by step."
    : driver
      ? `${driver.displayName} is driving. Everything the agent does will appear here as it happens; you can suggest an instruction below, or ask for the wheel.`
      : "Nobody's driving yet. Take control below to send the first instruction, or watch when someone else does.";

  return (
    <div className="empty">
      <h2 className="empty-title">{repo ? `Ready in ${repo}` : "Ready"}</h2>
      <p className="empty-lede">{lede}</p>

      <dl className="empty-facts">
        <div>
          <dt>repository</dt>
          <dd>{repo ?? <span className="empty-fact-dim">not reported yet</span>}</dd>
        </div>
        <div>
          <dt>agent</dt>
          <dd>
            {offline ? (
              <>
                <span className="empty-fact-error">No agent connected</span>
                <span className="empty-fact-dim">. Whoever owns the repository starts it:</span>
                <RunnerCommand />
              </>
            ) : agent.mode === "real" ? (
              <>
                <span className="empty-fact-live">{agentLabel(agent)}</span>
                <span className="empty-fact-dim">
                  {" "}
                  on the host&apos;s machine, billed to{" "}
                  {agent.keySource === "api-key" ? `the key ending ··${agent.keyHint}` : "their Claude Code login"}
                </span>
              </>
            ) : (
              <>
                Demo <span className="empty-fact-dim">(a scripted run, nothing is billed)</span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>in the room</dt>
          <dd>
            {participants.length > 0 && (
              <span className="avatars">
                {participants.map((p) => (
                  <Avatar key={p.id} participant={p} driving={p.id === driverId} />
                ))}
              </span>
            )}
            {participants.length === 1 ? (
              <span className="empty-fact-dim">just you, for now</span>
            ) : (
              <>
                you
                {others.length > 0 && (
                  <span className="empty-fact-dim">
                    {" "}
                    and {others.map((p) => p.displayName).join(", ")}
                  </span>
                )}
              </>
            )}
          </dd>
        </div>
      </dl>

      {isDriver && !offline && (
        <>
          <p className="empty-try">try asking</p>
          <ul className="empty-examples">
            {EXAMPLES.map((text) => (
              <li key={text}>
                <button type="button" className="empty-example" onClick={() => onExample(text)}>
                  {text}
                  <ArrowUpRight size={13} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="empty-invite">
        <button
          type="button"
          className="chrome-btn"
          onClick={() => copy(window.location.href)}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Link copied" : "Copy invite link"}
        </button>
        <span>Anyone with the link can watch.</span>
      </p>
    </div>
  );
}
