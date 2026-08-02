"use client";

import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Composer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-2 border-t border-[var(--border)] bg-[var(--surface-2)] p-3"
    >
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type an instruction…"
        className="h-9 bg-[var(--surface)] text-sm"
      />
      <Button type="submit" disabled={!text.trim()} className="h-9 px-4">
        Send
      </Button>
    </form>
  );
}
