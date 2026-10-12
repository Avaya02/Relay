"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import type { Event, Participant, SessionStatus } from "@relay/shared";
import { TurnBlock } from "./TurnBlock";
import { NewRowsProvider } from "./newRows";
import { groupTurns } from "./rows";

export function StreamView({
  storeKey,
  events,
  participants,
  selfId,
  status,
  runnerConnected,
  showSteps,
  demo = false,
  empty,
}: {
  // Keeps "already seen" across remounts.
  storeKey: string;
  events: Event[];
  participants: Participant[];
  selfId: string | null;
  status: SessionStatus;
  runnerConnected: boolean;
  showSteps: boolean;
  demo?: boolean;
  empty: ReactNode;
}) {
  const scrollerRef = useRef<HTMLElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  // Event count when last at the bottom; written only by the scroll handler.
  const [seenAtBottom, setSeenAtBottom] = useState(0);
  const [topTurn, setTopTurn] = useState<number | null>(null);

  const turns = useMemo(() => groupTurns(events), [events]);
  const missed = pinnedToBottom ? 0 : Math.max(0, events.length - seenAtBottom);
  const numbered = turns.filter((t) => t.instruction).length;

  const eventCountRef = useRef(events.length);
  useEffect(() => {
    eventCountRef.current = events.length;
  });

  // Only follow new events when already at the bottom.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !pinnedToBottom) return;
    el.scrollTop = el.scrollHeight;
    // Event count only: re-running when `pinnedToBottom` flips would yank the
    // user back down the instant they scrolled up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  // Content grows without events (late measuring), so stay pinned while streaming
  // and until first touch; later idle growth is a record opening, not a drag.
  const pinnedRef = useRef(false);
  const workingRef = useRef(false);
  const touchedRef = useRef(false);
  useEffect(() => {
    pinnedRef.current = pinnedToBottom;
    workingRef.current = status === "working";
  });
  useEffect(() => {
    const el = scrollerRef.current;
    const content = el?.firstElementChild;
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current && (workingRef.current || !touchedRef.current)) {
        el.scrollTop = el.scrollHeight;
      }
    });
    const touch = () => {
      touchedRef.current = true;
    };
    observer.observe(content);
    // The viewport shrinks when the dock or plan grows.
    observer.observe(el);
    el.addEventListener("pointerdown", touch);
    el.addEventListener("wheel", touch, { passive: true });
    el.addEventListener("keydown", touch);
    return () => {
      observer.disconnect();
      el.removeEventListener("pointerdown", touch);
      el.removeEventListener("wheel", touch);
      el.removeEventListener("keydown", touch);
    };
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      // 24px slack so resting a hair off the bottom still counts.
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      setPinnedToBottom(atBottom);
      if (atBottom) setSeenAtBottom(eventCountRef.current);

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
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
                    demo={demo}
                  />
                </div>
              ))}
            </NewRowsProvider>
          )}
        </div>
      </main>

      {missed > 0 && (
        <button type="button" onClick={jumpToLatest} className="room-jump">
          {status === "working" ? (
            <>
              <span className="rstatus-dot" aria-hidden />
              Jump to live
            </>
          ) : (
            <>
              <ArrowDown size={13} aria-hidden />
              {missed} new
            </>
          )}
        </button>
      )}
    </div>
  );
}
