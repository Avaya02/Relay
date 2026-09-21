"use client";

import { useState, type FormEvent } from "react";

export function JoinGate({
  sessionId,
  connection,
  lastError,
  joining,
  resuming,
  onJoin,
}: {
  sessionId: string;
  connection: string;
  lastError: string | null;
  joining: boolean;
  resuming: boolean;
  onJoin: (displayName: string) => void;
}) {
  const [name, setName] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onJoin(trimmed);
  }

  return (
    <div className="join">
      <div className="join-mark">
        <span className="join-wordmark">relay</span>
        <span className="join-tag">live agent session</span>
      </div>

      <div className="join-panel">
        <h1 className="join-heading">{resuming ? "Rejoining" : "Join session"}</h1>
        <p className="join-id">{sessionId}</p>

        {resuming ? (
          <p className="join-message">reconnecting you to this session…</p>
        ) : (
          <form onSubmit={handleSubmit} className="join-form">
            <input
              autoFocus
              className="join-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-label="Your name"
              maxLength={32}
              autoComplete="nickname"
            />
            <button
              type="submit"
              className="join-submit"
              disabled={!name.trim() || (joining && !lastError)}
            >
              {joining && !lastError ? "Joining…" : "Join session"}
            </button>
          </form>
        )}

        <p className="join-note">
          Everyone with the link watches the same session, live. One person drives at a
          time — you can ask for the wheel once you&rsquo;re in.
        </p>

        {connection === "connecting" && <p className="join-message">connecting…</p>}
        {connection === "error" && (
          <p className="join-message join-message--error">could not reach the server</p>
        )}
        {lastError && <p className="join-message join-message--error">{lastError}</p>}
      </div>
    </div>
  );
}
