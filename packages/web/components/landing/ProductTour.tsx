"use client";

import { useEffect, useRef, useState } from "react";

// A browser plays the first source it can decode: AV1 wherever there's a decoder,
// H.264 for the rest (Safari on hardware without one). Rendered by packages/video.
const SOURCES = [
  { src: "/tour/relay-tour-av1.mp4", type: 'video/mp4; codecs="av01.0.12M.08"' },
  { src: "/tour/relay-tour-h264.mp4", type: 'video/mp4; codecs="avc1.640032"' },
];

export function ProductTour() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  // Set by Pause, so scrolling away and back doesn't overrule the viewer.
  const held = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Buffer half a screen ahead, so playback doesn't open on a stall. A whole
    // screen fetched all 4 MB on load at 1440×900, before anyone scrolled.
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        video.preload = "auto";
        near.disconnect();
      },
      { rootMargin: "50% 0px" },
    );
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) video.pause();
        else if (!reduce && !held.current) void video.play().catch(() => {});
      },
      { threshold: 0.4 },
    );
    near.observe(video);
    seen.observe(video);
    return () => {
      near.disconnect();
      seen.disconnect();
    };
  }, []);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    held.current = !video.paused;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }

  return (
    <figure className="on-photo tour-figure">
      <div className="tour-frame">
        {/* Hidden from assistive tech: the caption carries the same story as text. */}
        <video
          ref={videoRef}
          className="tour-video"
          muted
          playsInline
          loop
          preload="none"
          poster="/tour/poster.webp"
          disablePictureInPicture
          aria-hidden
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        >
          {SOURCES.map((source) => (
            <source key={source.src} src={source.src} type={source.type} />
          ))}
        </video>
      </div>
      <figcaption className="demo-note">
        <span>
          Scripted tour, not a recording of a live session.
          <span className="sr-only">
            {" "}
            Avi copies npx relayrun from this page, runs it in a terminal, and opens the link it prints. In
            the session he asks the agent to paginate an endpoint and invites Himanshu, whose screen shows the
            same run as it happens. Himanshu asks for the wheel, Avi hands it over, and Himanshu&apos;s next
            instruction runs on both screens.
          </span>
        </span>
        <button
          type="button"
          className="demo-toggle"
          onClick={toggle}
          aria-label={playing ? "Pause the tour" : "Play the tour"}
        >
          {playing ? "Pause" : "Play"}
        </button>
      </figcaption>
    </figure>
  );
}
