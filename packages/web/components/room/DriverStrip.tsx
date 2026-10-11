"use client";

import { useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DropdownMenu } from "radix-ui";
import { ChevronDown, ShipWheel } from "lucide-react";
import type { Participant } from "@relay/shared";
import { useHue } from "./hues";
import { DriverAvatar, PresenceAvatar } from "./PresenceAvatar";
import { InviteButton } from "./InviteButton";

const SWAP = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

/**
 * Who has the wheel, and the one thing you can do about it from where you
 * sit. The line swaps rather than snaps on a handover, in step with the ring
 * travelling in the header.
 */
export function DriverStrip({
  participants,
  driverId,
  selfId,
  pendingRequests,
  onRequestControl,
  onCancelRequest,
  onHandOver,
  onRelease,
}: {
  participants: Participant[];
  driverId: string | null;
  selfId: string | null;
  pendingRequests: Participant[];
  onRequestControl: () => void;
  onCancelRequest: () => void;
  onHandOver: (participantId: string) => void;
  onRelease: () => void;
}) {
  const hue = useHue();
  const isDriver = selfId !== null && selfId === driverId;
  const driver = participants.find((p) => p.id === driverId) ?? null;
  const others = participants.filter((p) => p.id !== selfId);

  return (
    <>
      {isDriver &&
        pendingRequests.map((p) => (
          <div
            key={p.id}
            className="request"
            style={{ "--hue": hue(p.id) } as CSSProperties}
            role="status"
          >
            <PresenceAvatar participant={p} hue={hue(p.id)} size="sm" />
            <span className="request-text">
              <b>{p.displayName}</b> is asking for the wheel
            </span>
            <button
              type="button"
              className="rbtn rbtn--primary rbtn--sm"
              onClick={() => onHandOver(p.id)}
            >
              Hand over
            </button>
          </div>
        ))}

      <div className="strip">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={driverId ?? "nobody"}
            className="strip-who"
            style={driver ? ({ "--hue": hue(driver.id) } as CSSProperties) : undefined}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SWAP}
          >
            {driver ? (
              <>
                <DriverAvatar participant={driver} hue={hue(driver.id)} size="sm" />
                <span className="strip-text">
                  <b>{isDriver ? "You" : driver.displayName}</b>{" "}
                  {isDriver ? "have the wheel" : "has the wheel"}
                  <span className="strip-meta">
                    {isDriver
                      ? others.length > 0
                        ? ` · ${others.length} watching`
                        : " · just you so far"
                      : " · you're watching"}
                  </span>
                </span>
              </>
            ) : (
              <>
                <span className="strip-nowheel" aria-hidden>
                  <ShipWheel size={12} />
                </span>
                <span className="strip-text">Nobody has the wheel</span>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="strip-actions">
          {isDriver ? (
            others.length > 0 ? (
              <>
                <HandOverMenu others={others} onHandOver={onHandOver} />
                <button type="button" className="rbtn rbtn--ghost rbtn--sm" onClick={onRelease}>
                  Release
                </button>
              </>
            ) : (
              <InviteButton />
            )
          ) : (
            // Keyed on the driver so "asked, waiting" resets by remounting when
            // the wheel actually moves, rather than syncing state in an effect.
            <WatcherAction
              key={driverId ?? "nobody"}
              driver={driver}
              onRequestControl={onRequestControl}
              onCancelRequest={onCancelRequest}
            />
          )}
        </div>
      </div>
    </>
  );
}

function WatcherAction({
  driver,
  onRequestControl,
  onCancelRequest,
}: {
  driver: Participant | null;
  onRequestControl: () => void;
  onCancelRequest: () => void;
}) {
  const [asked, setAsked] = useState(false);

  if (!driver) {
    return (
      <button type="button" className="rbtn rbtn--primary rbtn--sm" onClick={onRequestControl}>
        <ShipWheel size={14} aria-hidden />
        Take the wheel
      </button>
    );
  }
  if (asked) {
    return (
      <>
        <span className="strip-waiting" role="status">
          Asked {driver.displayName}
        </span>
        <button
          type="button"
          className="rbtn rbtn--ghost rbtn--sm"
          onClick={() => {
            setAsked(false);
            onCancelRequest();
          }}
        >
          Cancel
        </button>
      </>
    );
  }
  return (
    <button
      type="button"
      className="rbtn rbtn--secondary rbtn--sm"
      onClick={() => {
        setAsked(true);
        onRequestControl();
      }}
    >
      Ask for the wheel
    </button>
  );
}

function HandOverMenu({
  others,
  onHandOver,
}: {
  others: Participant[];
  onHandOver: (participantId: string) => void;
}) {
  const hue = useHue();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="rbtn rbtn--secondary rbtn--sm">
          Hand over
          <ChevronDown size={13} aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="rmenu"
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={12}
        >
          <DropdownMenu.Label className="rmenu-label">Hand the wheel to</DropdownMenu.Label>
          {others.map((p) => (
            <DropdownMenu.Item
              key={p.id}
              className="rmenu-item"
              onSelect={() => onHandOver(p.id)}
            >
              <PresenceAvatar participant={p} hue={hue(p.id)} size="xs" />
              {p.displayName}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
