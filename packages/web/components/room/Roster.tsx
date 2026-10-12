"use client";

import type { CSSProperties } from "react";
import { motion } from "motion/react";
import { Check, Hand, Link2, ShipWheel } from "lucide-react";
import type { Participant } from "@relay/shared";
import { useCopy } from "@/components/session/useCopy";
import { useHue } from "./hues";
import { DriverAvatar, PresenceAvatar } from "./PresenceAvatar";
import { RoomPopover } from "./pop";

// At eight people the full row overflowed a phone header.
const VISIBLE = 4;

const WHEEL_SPRING = { type: "spring", stiffness: 380, damping: 30 } as const;

// Join order, not driver-first, so a handover moves the ring instead of reshuffling people.
export function Roster({
  participants,
  driverId,
  selfId,
  pendingRequests,
  onHandOver,
}: {
  participants: Participant[];
  driverId: string | null;
  selfId: string | null;
  pendingRequests: Participant[];
  onHandOver: (participantId: string) => void;
}) {
  const hue = useHue();
  const driver = participants.find((p) => p.id === driverId) ?? null;
  const asking = new Set(pendingRequests.map((p) => p.id));

  let visible = participants.slice(0, VISIBLE);
  if (driver && !visible.includes(driver)) visible = [...visible.slice(0, VISIBLE - 1), driver];
  const hidden = participants.length - visible.length;

  const summary = driver
    ? driver.id === selfId
      ? "you have the wheel"
      : `${driver.displayName} has the wheel`
    : "nobody has the wheel";

  return (
    <RoomPopover
      label="People in this session"
      width="20rem"
      trigger={
        <button
          type="button"
          className="roster"
          aria-label={`${participants.length} in this session, ${summary}`}
        >
          <span className="roster-stack">
            {visible.map((p) => (
              <span
                key={p.id}
                className="roster-slot"
                style={{ "--hue": hue(p.id) } as CSSProperties}
              >
                <PresenceAvatar participant={p} hue={hue(p.id)} />
                {p.id === driverId && (
                  <>
                    <motion.span
                      layoutId="room-wheel-ring"
                      className="wheel-ring"
                      transition={WHEEL_SPRING}
                      aria-hidden
                    />
                  </>
                )}
                {asking.has(p.id) && (
                  <span className="roster-asking" aria-hidden>
                    <Hand size={9} strokeWidth={2.5} />
                  </span>
                )}
              </span>
            ))}
            {hidden > 0 && <span className="roster-more">+{hidden}</span>}
          </span>
          <span
            className="roster-label"
            style={driver ? ({ "--hue": hue(driver.id) } as CSSProperties) : undefined}
          >
            {driver ? (
              driver.id === selfId ? (
                <>
                  <b>You</b> have the wheel
                </>
              ) : (
                <>
                  <b>{driver.displayName}</b> has the wheel
                </>
              )
            ) : (
              "Nobody has the wheel"
            )}
          </span>
        </button>
      }
    >
      <People
        participants={participants}
        driverId={driverId}
        selfId={selfId}
        asking={asking}
        onHandOver={onHandOver}
      />
    </RoomPopover>
  );
}

function People({
  participants,
  driverId,
  selfId,
  asking,
  onHandOver,
}: {
  participants: Participant[];
  driverId: string | null;
  selfId: string | null;
  asking: Set<string>;
  onHandOver: (participantId: string) => void;
}) {
  const hue = useHue();
  const { copied, copy } = useCopy();
  const isDriver = selfId !== null && selfId === driverId;

  return (
    <>
      <div className="people-head">
        <span>In this session</span>
        <span className="count">{participants.length}</span>
      </div>
      <ul className="people">
        {participants.map((p) => {
          const role = p.id === driverId ? "driving" : asking.has(p.id) ? "asking" : "watching";
          return (
            <li key={p.id} className="person" style={{ "--hue": hue(p.id) } as CSSProperties}>
              {role === "driving" ? (
                <DriverAvatar participant={p} hue={hue(p.id)} size="sm" />
              ) : (
                <PresenceAvatar participant={p} hue={hue(p.id)} size="sm" />
              )}
              <span>
                <span className="person-name">
                  {p.displayName}
                  {p.id === selfId && <span className="person-you">you</span>}
                </span>
                <span className="person-role" data-role={role}>
                  {role === "driving" ? (
                    <>
                      <ShipWheel size={12} aria-hidden /> Has the wheel
                    </>
                  ) : role === "asking" ? (
                    <>
                      <Hand size={12} aria-hidden /> Asking for the wheel
                    </>
                  ) : (
                    "Watching"
                  )}
                </span>
              </span>
              {isDriver && p.id !== selfId ? (
                <button
                  type="button"
                  className={`rbtn rbtn--xs ${role === "asking" ? "rbtn--primary" : "rbtn--secondary"}`}
                  onClick={() => onHandOver(p.id)}
                >
                  Hand over
                </button>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ul>
      <div className="people-foot">
        <span>Anyone with the link can join</span>
        <button
          type="button"
          className="rbtn rbtn--ghost rbtn--xs"
          onClick={() => copy(window.location.href)}
          data-copied={copied || undefined}
        >
          {copied ? <Check size={13} /> : <Link2 size={13} />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </>
  );
}
