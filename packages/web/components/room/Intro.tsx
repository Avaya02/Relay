"use client";

import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import type { AgentInfo, Participant } from "@relay/shared";
import { useHue } from "./hues";
import { DriverAvatar, PresenceAvatar } from "./PresenceAvatar";
import { InviteButton } from "./InviteButton";
import { RunnerCommand, agentLabel, agentState } from "./agent";

// Repo-agnostic on purpose: the first three things anyone asks of an agent
// in a codebase they're about to watch it work in.
const EXAMPLES = [
  "Summarize what this repository does and how it's laid out",
  "Find the three largest source files and suggest how to split them",
  "Run the test suite and report what fails and why",
];

function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Before the first instruction: who's here, what's attached, what to try.
 * It changes with the viewer's role, since a watcher can't act on "type an
 * instruction" but can suggest one.
 */
export function Intro({
  repo,
  agent,
  participants,
  driverId,
  selfId,
  onExample,
  suggestionsPending = false,
}: {
  repo: string | null;
  agent: AgentInfo | null;
  participants: Participant[];
  driverId: string | null;
  selfId: string | null;
  onExample: (text: string) => void;
  /** The dock already holds instructions waiting; a second list competes. */
  suggestionsPending?: boolean;
}) {
  const hue = useHue();
  const state = agentState(agent);
  const isDriver = selfId !== null && selfId === driverId;
  const driver = participants.find((p) => p.id === driverId) ?? null;
  // You first, then everyone else in the order they arrived.
  const people = [
    ...participants.filter((p) => p.id === selfId),
    ...participants.filter((p) => p.id !== selfId),
  ];

  const lede = isDriver
    ? "Everyone with the link sees this run live. You have the wheel: what you send runs on the host's machine and streams here step by step."
    : driver
      ? `${driver.displayName} has the wheel. Everything the agent does appears here as it happens. Suggest an instruction below, or ask for the wheel.`
      : "Nobody has the wheel yet. Take it below to send the first instruction, or suggest one for whoever does.";

  return (
    <div className="intro">
      <h2 className="intro-title">
        {repo ? (
          <>
            Ready in <span className="intro-repo">{repo}</span>
          </>
        ) : (
          "Ready"
        )}
      </h2>
      <p className="intro-lede">{lede}</p>

      <dl className="intro-facts">
        <div className="intro-row">
          <dt>People</dt>
          <dd>
            <span className="intro-avatars">
              {people.map((p) =>
                p.id === driverId ? (
                  <DriverAvatar key={p.id} participant={p} hue={hue(p.id)} size="sm" />
                ) : (
                  <PresenceAvatar key={p.id} participant={p} hue={hue(p.id)} size="sm" />
                ),
              )}
            </span>
            <span className="intro-names">
              {people.length === 1
                ? "Just you so far"
                : nameList(people.map((p) => (p.id === selfId ? "You" : p.displayName)))}
            </span>
            <InviteButton />
          </dd>
        </div>
        <div className="intro-row">
          <dt>Agent</dt>
          <dd>
            {state === "offline" ? (
              <span className="intro-agent">
                <span className="intro-agent-line">
                  <span className="agent-dot" data-agent="offline" aria-hidden />
                  Not connected. Whoever owns the repository starts it:
                </span>
                <RunnerCommand />
              </span>
            ) : state === "live" && agent ? (
              <span className="intro-agent-line">
                <span className="agent-dot" data-agent="live" aria-hidden />
                <b>{agentLabel(agent)}</b>
                <span className="intro-dim">
                  on the host&apos;s machine, billed to{" "}
                  {agent.keySource === "api-key"
                    ? `the key ending ··${agent.keyHint}`
                    : "their Claude Code login"}
                </span>
              </span>
            ) : (
              <span className="intro-agent-line">
                <span className="agent-dot" aria-hidden />
                <b>Demo</b>
                <span className="intro-dim">a scripted run, nothing is billed</span>
              </span>
            )}
          </dd>
        </div>
      </dl>

      {state !== "offline" && !suggestionsPending && (
        <section
          className="intro-try"
          style={driver ? ({ "--hue": hue(driver.id) } as CSSProperties) : undefined}
        >
          <h3 className="intro-try-title">
            {isDriver ? "Try asking" : driver ? `Suggest one to ${driver.displayName}` : "Suggest a first instruction"}
          </h3>
          <ul className="intro-examples">
            {EXAMPLES.map((text) => (
              <li key={text}>
                <button type="button" className="intro-example" onClick={() => onExample(text)}>
                  <span>{text}</span>
                  <ArrowUpRight size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
