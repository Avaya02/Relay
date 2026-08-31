"use client";

import { useState, type FormEvent } from "react";
import type { SessionStatus } from "@relay/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Composer({
  onSend,
  status,
  onStop,
}: {
  onSend: (text: string) => void;
  status: SessionStatus;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const working = status === "working";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <form onSubmit={handleSubmit} className="composer">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        // Says what happens to it, since a run is already in flight and the
        // server queues rather than interrupts.
        placeholder={
          working ? "Queue the next instruction…" : "Type an instruction…"
        }
        aria-label="Instruction for the agent"
        className="composer-input h-9 bg-[var(--surface)] text-sm"
      />
      {working && (
        <button type="button" className="composer-stop" onClick={onStop}>
          Stop
        </button>
      )}
      {/* Same shape as the landing page's primary button, deliberately: this
          is the one control the two registers share, and it should look
          identical in both. */}
      <Button type="submit" disabled={!text.trim()} className="btn-solid">
        {working ? "Queue" : "Send"}
      </Button>
    </form>
  );
}
