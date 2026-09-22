"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { JoinScenePhoto, JoinSceneSky } from "./JoinScene";

// Which left half to show. "photo" is the full-bleed ridge photograph, kept
// as the backup.
const JOIN_SCENE: "sky" | "photo" = "sky";

/**
 * The door into a session. Split evenly like a sign-in page: the scene on one
 * side — the product's own ridge photograph, so an invited stranger meets one
 * brand — and the one question we need answered on the other.
 */
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
  const busy = (joining && !lastError) || resuming;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onJoin(trimmed);
  }

  return (
    <div className="join">
      {JOIN_SCENE === "sky" ? <JoinSceneSky /> : <JoinScenePhoto />}

      <main className="join-main">
        <Card className="join-card">
          <CardHeader className="gap-2">
            <CardTitle className="text-xl font-medium tracking-tight">
              {resuming ? "Rejoining session" : "Join session"}
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <span>Session</span>
              <code className="join-code">{sessionId}</code>
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            {resuming ? (
              <p className="join-status">
                <LoaderCircle size={14} className="join-spin" />
                Reconnecting you to this session…
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="join-name">Your name</Label>
                  <Input
                    id="join-name"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="How the room will see you"
                    maxLength={32}
                    autoComplete="nickname"
                    className="h-10 rounded-md bg-[var(--surface-2)] px-3 text-[15px]"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={!name.trim() || busy}
                  className="h-10 w-full rounded-md text-[15px] font-medium"
                >
                  {busy ? (
                    <>
                      <LoaderCircle size={15} className="join-spin" />
                      Joining…
                    </>
                  ) : (
                    <>
                      Enter the session
                      <ArrowRight size={15} />
                    </>
                  )}
                </Button>
              </form>
            )}

            {(connection === "connecting" || connection === "error" || lastError) && (
              <p
                className={`join-status${connection === "error" || lastError ? " join-status--error" : ""}`}
                role="status"
              >
                {lastError ??
                  (connection === "error" ? "Could not reach the server." : "Connecting…")}
              </p>
            )}

            <Separator />

            <p className="join-note">
              You&rsquo;ll join as a watcher. Ask for the wheel once you&rsquo;re in, and
              the driver can hand it to you without stopping the agent.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
