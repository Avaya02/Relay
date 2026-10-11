"use client";

import { useCallback, useEffect, useState } from "react";
import { usePanel } from "@/lib/prefs";
import { useMedia } from "@/lib/useMedia";

type Peek = "sessions" | "changes" | null;

/**
 * The two side panels. On a wide screen each is open or closed by
 * preference; on a narrow one it floats over the stream and opens only on
 * request, without disturbing the preference the wide screen remembers.
 */
export function usePanels() {
  const [sessionsPref, setSessionsPref] = usePanel("sessions");
  const [changesPref, setChangesPref] = usePanel("changes");
  const narrowRail = useMedia("(max-width: 1099px)");
  const narrowChanges = useMedia("(max-width: 899px)");
  const [peek, setPeek] = useState<Peek>(null);

  const sessionsOpen = narrowRail ? peek === "sessions" : sessionsPref;
  const changesOpen = narrowChanges ? peek === "changes" : changesPref;
  const floating = (narrowRail && peek === "sessions") || (narrowChanges && peek === "changes");

  const closePeek = useCallback(() => setPeek(null), []);

  useEffect(() => {
    if (!floating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPeek(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [floating]);

  return {
    sessionsOpen,
    changesOpen,
    floating,
    closePeek,
    toggleSessions: () =>
      narrowRail
        ? setPeek((p) => (p === "sessions" ? null : "sessions"))
        : setSessionsPref(!sessionsPref),
    toggleChanges: () =>
      narrowChanges
        ? setPeek((p) => (p === "changes" ? null : "changes"))
        : setChangesPref(!changesPref),
  };
}
