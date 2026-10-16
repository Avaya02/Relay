"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";

// A browser plays the first source it can decode: AV1 wherever there's a decoder,
// H.264 for the rest (Safari on hardware without one). Rendered by packages/video.
// Bump the version on every re-encode: browsers cache video by URL.
const VERSION = 5;
const SOURCES = [
  { src: `/tour/relay-tour-av1.mp4?v=${VERSION}`, type: 'video/mp4; codecs="av01.0.12M.08"' },
  { src: `/tour/relay-tour-h264.mp4?v=${VERSION}`, type: 'video/mp4; codecs="avc1.640032"' },
];

// Seconds into the film where each beat starts (packages/video/src/script.ts).
const DURATION = 36.4;
const CHAPTERS = [
  { label: "Run it", at: 0 },
  { label: "Instruct", at: 7.2 },
  { label: "Invite", at: 12.9 },
  { label: "Hand over", at: 18.6 },
  { label: "Drive", at: 23.4 },
];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ProductTour() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
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

  // timeupdate fires about four times a second; the bar follows every frame instead.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      setTime(videoRef.current?.currentTime ?? 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    held.current = !video.paused;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }

  function seek(to: number) {
    const video = videoRef.current;
    if (!video) return;
    const t = Math.min(DURATION - 0.05, Math.max(0, to));
    video.currentTime = t;
    setTime(t);
  }

  function seekToPointer(e: PointerEvent<HTMLDivElement>) {
    const box = trackRef.current?.getBoundingClientRect();
    if (box) seek(((e.clientX - box.left) / box.width) * DURATION);
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -5, ArrowRight: 5 }[e.key];
    if (step !== undefined) seek(time + step);
    else if (e.key === "Home") seek(0);
    else if (e.key === "End") seek(DURATION);
    else return;
    e.preventDefault();
  }

  const current = CHAPTERS.findLastIndex((c) => time >= c.at);

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
          poster={`/tour/poster.webp?v=${VERSION}`}
          disablePictureInPicture
          aria-hidden
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={toggle}
        >
          {SOURCES.map((source) => (
            <source key={source.src} src={source.src} type={source.type} />
          ))}
        </video>
      </div>

      <div className="tour-bar">
        <button
          type="button"
          className="tour-play"
          onClick={toggle}
          aria-label={playing ? "Pause the tour" : "Play the tour"}
        >
          {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
        </button>
        <div className="tour-chapters">
          <div
            ref={trackRef}
            className="tour-track"
            role="slider"
            tabIndex={0}
            aria-label="Tour position"
            aria-valuemin={0}
            aria-valuemax={Math.round(DURATION)}
            aria-valuenow={Math.round(time)}
            aria-valuetext={`${clock(time)} of ${clock(DURATION)}, ${CHAPTERS[current]?.label ?? ""}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              seekToPointer(e);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) seekToPointer(e);
            }}
            onKeyDown={onKey}
          >
            {CHAPTERS.map((c, i) => {
              const end = CHAPTERS[i + 1]?.at ?? DURATION;
              const fill = Math.min(1, Math.max(0, (time - c.at) / (end - c.at)));
              return (
                <span key={c.label} className="tour-seg" style={{ flexGrow: end - c.at }}>
                  <span className="tour-seg-fill" style={{ transform: `scaleX(${fill})` }} />
                </span>
              );
            })}
          </div>
          <div className="tour-labels">
            {CHAPTERS.map((c, i) => {
              const end = CHAPTERS[i + 1]?.at ?? DURATION;
              return (
                <button
                  key={c.label}
                  type="button"
                  className="tour-label"
                  style={{ flexGrow: end - c.at }}
                  data-current={i === current || undefined}
                  onClick={() => seek(c.at)}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
        <span className="tour-time">
          {clock(time)} / {clock(DURATION)}
        </span>
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
      </figcaption>
    </figure>
  );
}
