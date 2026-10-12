"use client";

import { useCallback, useState } from "react";
import { getFaviconUrl } from "@/lib/favicon";

// `onError` isn't enough: an image from server-rendered HTML usually fails before
// React attaches a handler and the event is never replayed, so use decode().
export function useFavicon(url?: string) {
  const resolved = url ? getFaviconUrl(url) : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = resolved && resolved !== failedSrc ? resolved : null;

  const ref = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !src) return;

      let released = false;
      img.decode().catch(() => {
        if (!released) setFailedSrc(src);
      });

      // A late rejection would describe an image we no longer show.
      return () => {
        released = true;
      };
    },
    [src],
  );

  return { src, ref };
}
