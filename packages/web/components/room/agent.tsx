"use client";

import { Check, Copy } from "lucide-react";
import type { AgentInfo } from "@relay/shared";
import { useCopy } from "@/components/session/useCopy";

/** `claude-sonnet-5` → `sonnet-5`. Only the vendor prefix, only when present. */
export function shortModel(model: string | null): string {
  if (!model) return "Live";
  return model.replace(/^claude-/, "");
}

export function agentLabel(agent: AgentInfo | null): string {
  if (!agent || !agent.runnerConnected) return "Offline";
  return agent.mode === "real" ? shortModel(agent.model) : "Demo";
}

export type AgentState = "live" | "demo" | "offline";

export function agentState(agent: AgentInfo | null): AgentState {
  if (!agent || !agent.runnerConnected) return "offline";
  return agent.mode === "real" ? "live" : "demo";
}

/** The one command that brings an agent into a session, copyable in place. */
export function RunnerCommand() {
  const { copied, copy } = useCopy();
  return (
    <span className="cmdchip">
      <code>npx relayrun</code>
      <button
        type="button"
        className="rbtn rbtn--icon rbtn--sm"
        onClick={() => copy("npx relayrun")}
        data-copied={copied || undefined}
        aria-label={copied ? "Copied" : "Copy command"}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </span>
  );
}
