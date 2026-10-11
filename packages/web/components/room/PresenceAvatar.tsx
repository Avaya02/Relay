import type { CSSProperties } from "react";
import type { Participant } from "@relay/shared";
import { initials } from "@/lib/presence";

export function PresenceAvatar({
  participant,
  hue,
  size = "md",
}: {
  participant: Pick<Participant, "displayName">;
  hue: string;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  return (
    <span
      className={size === "md" ? "pa" : `pa pa--${size}`}
      style={{ "--hue": hue } as CSSProperties}
      aria-hidden
    >
      {initials(participant.displayName)}
    </span>
  );
}

/** An avatar wearing the wheel: the driver, everywhere they appear. */
export function DriverAvatar({
  participant,
  hue,
  size = "md",
}: {
  participant: Pick<Participant, "displayName">;
  hue: string;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  return (
    <span className="wheel" style={{ "--hue": hue } as CSSProperties}>
      <PresenceAvatar participant={participant} hue={hue} size={size} />
      <span className="wheel-ring" aria-hidden />
    </span>
  );
}
