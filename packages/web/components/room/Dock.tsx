"use client";

import type { ComponentProps } from "react";
import type { Participant, Suggestion } from "@relay/shared";
import { Composer } from "./Composer";
import { DriverStrip } from "./DriverStrip";
import { SuggestionTray } from "./SuggestionTray";

/**
 * Everything you can do in the room, in one place under the transcript:
 * who has the wheel, what the watchers are suggesting, and the field. It
 * used to be three strips stacked over the stream; as one card it reads as
 * one instrument, edged in the colour of whoever is driving.
 */
export function Dock({
  online,
  participants,
  driverId,
  selfId,
  pendingRequests,
  suggestions,
  onRequestControl,
  onCancelRequest,
  onHandOver,
  onRelease,
  onPromote,
  onDismiss,
  composer,
}: {
  online: boolean;
  participants: Participant[];
  driverId: string | null;
  selfId: string | null;
  pendingRequests: Participant[];
  suggestions: Suggestion[];
  onRequestControl: () => void;
  onCancelRequest: () => void;
  onHandOver: (participantId: string) => void;
  onRelease: () => void;
  onPromote: (id: string) => void;
  onDismiss: (id: string) => void;
  composer: ComponentProps<typeof Composer>;
}) {
  const isDriver = selfId !== null && selfId === driverId;

  return (
    <div className="dock">
      <div className="dock-card">
        {/* Wheel and suggestion actions would silently do nothing while the
            socket is down, so they wait for it; the field stays and says why
            it's paused. */}
        {online && (
          <>
            <DriverStrip
              participants={participants}
              driverId={driverId}
              selfId={selfId}
              pendingRequests={pendingRequests}
              onRequestControl={onRequestControl}
              onCancelRequest={onCancelRequest}
              onHandOver={onHandOver}
              onRelease={onRelease}
            />
            <SuggestionTray
              suggestions={suggestions}
              isDriver={isDriver}
              selfId={selfId}
              driverId={driverId}
              onPromote={onPromote}
              onDismiss={onDismiss}
            />
          </>
        )}
        <Composer {...composer} />
      </div>
    </div>
  );
}
