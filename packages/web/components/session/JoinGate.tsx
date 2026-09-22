"use client";

import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  Link2,
  LoaderCircle,
  Terminal,
} from "lucide-react";
import { JoinScenePhoto, JoinSceneSky } from "./JoinScene";

const JOIN_SCENE: "sky" | "photo" = "photo";

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
  const [copied, setCopied] = useState(false);
  const busy = (joining && !lastError) || resuming;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onJoin(trimmed);
  }

  function handleCopyLink() {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="join">
      {JOIN_SCENE === "sky" ? <JoinSceneSky /> : <JoinScenePhoto />}

      <main className="join-main">
        <div className="join-card w-full max-w-[420px] overflow-hidden rounded-[20px] border border-white/10 bg-[#131316] shadow-2xl shadow-black/80 ring-1 ring-white/5">
          <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#0d0d10] px-4 py-3 select-none">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#ff5f56] border border-[#e0443e]/40 shadow-sm" />
              <span className="h-3 w-3 rounded-full bg-[#ffbd2e] border border-[#dea123]/40 shadow-sm" />
              <span className="h-3 w-3 rounded-full bg-[#27c93f] border border-[#1aab29]/40 shadow-sm" />
              <span className="ml-2 font-mono text-xs text-neutral-400">
                relay / session
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-neutral-500">
              <Terminal size={13} />
              <span className="font-mono text-[11px]">live</span>
            </div>
          </div>

          <div className="flex flex-col gap-5 p-6 sm:p-7">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {resuming ? "Rejoining session" : "Join session"}
              </h1>
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <div className="flex items-center gap-2">
                  <span>Session</span>
                  <code className="rounded-[6px] border border-white/10 bg-[#1a1a1e] px-2 py-0.5 font-mono text-xs text-neutral-200">
                    {sessionId}
                  </code>
                </div>
              </div>
            </div>

            {resuming ? (
              <div className="flex items-center gap-2 rounded-[12px] border border-white/10 bg-[#18181c] p-4 text-sm text-neutral-300">
                <LoaderCircle size={15} className="animate-spin text-neutral-400" />
                <span>Reconnecting you to this session…</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="join-name"
                    className="text-sm font-medium text-neutral-200"
                  >
                    Your name
                  </label>
                  <input
                    id="join-name"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="How the room will see you"
                    maxLength={32}
                    autoComplete="nickname"
                    className="h-11 w-full rounded-[12px] border border-white/10 bg-[#18181c] px-3.5 text-sm text-white placeholder:text-neutral-500 transition-all focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!name.trim() || busy}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-white text-sm font-medium text-black shadow-sm transition-all hover:bg-neutral-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? (
                    <>
                      <LoaderCircle size={15} className="animate-spin" />
                      <span>Joining…</span>
                    </>
                  ) : (
                    <>
                      <span>Enter the session</span>
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>
            )}

            <div className="relative my-0.5 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/[0.08]" />
              </div>
              <span className="relative bg-[#131316] px-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                or
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopyLink}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-white/10 bg-[#18181c] text-sm font-medium text-neutral-300 transition-all hover:bg-[#222226] hover:text-white active:scale-[0.99]"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-emerald-400" />
                  <span className="text-emerald-400">Invitation link copied</span>
                </>
              ) : (
                <>
                  <Link2 size={14} className="text-neutral-400" />
                  <span>Copy invitation link</span>
                </>
              )}
            </button>

            {(connection === "connecting" || connection === "error" || lastError) && (
              <div
                className={`flex items-center gap-2 rounded-[10px] px-3 py-2 text-xs ${
                  connection === "error" || lastError
                    ? "border border-red-500/20 bg-red-500/10 text-red-300"
                    : "border border-amber-500/20 bg-amber-500/10 text-amber-300"
                }`}
                role="status"
              >
                {connection === "error" || lastError ? (
                  <AlertCircle size={14} className="shrink-0" />
                ) : (
                  <LoaderCircle size={14} className="shrink-0 animate-spin" />
                )}
                <span>
                  {lastError ??
                    (connection === "error" ? "Could not reach the server." : "Connecting…")}
                </span>
              </div>
            )}

            <div className="flex items-start gap-2.5 rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-relaxed text-neutral-400">
              <Eye size={15} className="mt-0.5 shrink-0 text-neutral-500" />
              <p className="m-0">
                You&rsquo;ll join as a watcher. Ask for the wheel once you&rsquo;re in, and
                the driver can hand it to you without stopping the agent.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
