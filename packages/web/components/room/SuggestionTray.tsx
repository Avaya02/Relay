"use client";

import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, X } from "lucide-react";
import type { Suggestion } from "@relay/shared";
import { useHue } from "./hues";
import { PresenceAvatar } from "./PresenceAvatar";
import { Tip } from "./pop";

const EASE = [0.22, 1, 0.36, 1] as const;

export function SuggestionTray({
  suggestions,
  isDriver,
  selfId,
  driverId,
  onPromote,
  onDismiss,
}: {
  suggestions: Suggestion[];
  isDriver: boolean;
  selfId: string | null;
  driverId: string | null;
  onPromote: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const hue = useHue();

  return (
    <AnimatePresence initial={false}>
      {suggestions.length > 0 && (
        <motion.section
          key="tray"
          className="sugg"
          aria-label="Suggestions waiting for the driver"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: EASE }}
        >
          <div className="sugg-head">
            <span>Suggestions</span>
            <span className="count">{suggestions.length}</span>
            {isDriver && <span className="sugg-hint">Send one to run it next</span>}
          </div>
          <ul className="sugg-list">
            <AnimatePresence initial={false}>
              {suggestions.map((s) => {
                // Authors can withdraw their own, or a typo sits in front of the room.
                const canDismiss = isDriver || s.by === selfId;
                const mine = s.by === selfId;
                return (
                  <motion.li
                    key={s.id}
                    className="sugg-item"
                    style={{ "--hue": hue(s.by) } as CSSProperties}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: EASE }}
                  >
                    <div className="sugg-row">
                      <PresenceAvatar
                        participant={{ displayName: s.displayName }}
                        hue={hue(s.by)}
                        size="xs"
                      />
                      <div className="sugg-body">
                        <span className="sugg-by">
                          {/* Written before they took the wheel: their own note now. */}
                          {s.by === driverId
                            ? mine
                              ? "Your earlier suggestion"
                              : `${s.displayName}'s earlier suggestion`
                            : mine
                              ? "You"
                              : s.displayName}
                        </span>
                        <p className="sugg-text">{s.text}</p>
                      </div>
                      <div className="sugg-actions">
                        {isDriver && (
                          <button
                            type="button"
                            className="rbtn rbtn--secondary rbtn--xs"
                            onClick={() => onPromote(s.id)}
                          >
                            <ArrowUp size={12} aria-hidden />
                            Send
                          </button>
                        )}
                        {canDismiss && (
                          <Tip label={mine && !isDriver ? "Withdraw" : "Dismiss"}>
                            <button
                              type="button"
                              className="rbtn rbtn--icon rbtn--xs sugg-dismiss"
                              onClick={() => onDismiss(s.id)}
                              aria-label={
                                mine ? "Withdraw your suggestion" : `Dismiss suggestion from ${s.displayName}`
                              }
                            >
                              <X size={13} />
                            </button>
                          </Tip>
                        )}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
