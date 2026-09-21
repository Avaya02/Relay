"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import type { Event, Participant, SessionStatus } from "@relay/shared";
import { TurnBlock } from "./TurnBlock";
import { NewRowsProvider } from "./newRows";
import { groupTurns } from "./rows";

/**
 * The scrolling conversation. Owns three things the turns can't: staying
 * pinned to the bottom while the viewer is there, offering the way back down
 * when they aren't, and saying which turn is under the top edge on a long
 * transcript.
 */
export function StreamView({
  storeKey,
  events,
  participants,
  selfId,
  status,
  runnerConnected,
  showSteps,
  empty,
}: {
  /** Identifies the transcript, so "already seen" survives a remount. */
  storeKey: string;
  events: Event[];
  participants: Participant[];
  selfId: string | null;
  status: SessionStatus;
  runnerConnected: boolean;
  showSteps: boolean;
  /** What to show before the first instruction — the caller knows the role. */
  empty: ReactNode;
}) {
  const scrollerRef = useRef<HTMLElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  // Event count as of the last time the viewer was at the bottom. Only ever
  // written from the scroll handler: while pinned, `missed` is 0 regardless.
  const [seenAtBottom, setSeenAtBottom] = useState(0);
  const [topTurn, setTopTurn] = useState<number | null>(null);

  const turns = useMemo(() => groupTurns(events), [events]);
  const missed = pinnedToBottom ? 0 : Math.max(0, events.length - seenAtBottom);
  const numbered = turns.filter((t) => t.instruction).length;

  const eventCountRef = useRef(events.length);
  useEffect(() => {
    eventCountRef.current = events.length;
  });

  // Only auto-scroll when the viewer was already at the bottom. Scrolling up
  // to read back must not be yanked away by the next event.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !pinnedToBottom) return;
    el.scrollTop = el.scrollHeight;
    // Keyed on event count only: re-running when `pinnedToBottom` flips would
    // scroll the user back down the instant they scrolled up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      // 24px of slack so a resting position a hair off the bottom still counts.
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      setPinnedToBottom(atBottom);
      if (atBottom) setSeenAtBottom(eventCountRef.current);

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // The turn whose top has passed the top edge is the one being read.
        const sections = el.querySelectorAll<HTMLElement>("[data-turn]");
        let current: number | null = null;
        for (const s of sections) {
          if (s.offsetTop - el.scrollTop <= 48) current = Number(s.dataset.turn);
          else break;
        }
        setTopTurn(el.scrollTop > 80 ? current : null);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  function jumpToLatest() {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setPinnedToBottom(true);
    setSeenAtBottom(events.length);
  }

  return (
    <div className="stream-wrap">
      {topTurn !== null && numbered > 1 && (
        <div className="turn-marker" aria-hidden>
          turn {topTurn} of {numbered}
        </div>
      )}

      <main
        ref={scrollerRef}
        className="stream"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Session transcript"
      >
        <div className="stream-measure">
          {turns.length === 0 ? (
            empty
          ) : (
            <NewRowsProvider storeKey={storeKey} events={events}>
              {turns.map((turn) => (
                <div key={turn.key} data-turn={turn.number || undefined}>
                  <TurnBlock
                    turn={turn}
                    participants={participants}
                    selfId={selfId}
                    status={status}
                    runnerConnected={runnerConnected}
                    showSteps={showSteps}
                  />
                </div>
              ))}
            </NewRowsProvider>
          )}
        </div>
      </main>

      {missed > 0 && (
        <button type="button" onClick={jumpToLatest} className="jump">
          <ArrowDown size={13} />
          {missed} new
        </button>
      )}
    </div>
  );
}
