import type { CSSProperties } from "react";
import { Check, ChevronDown, GitBranch, Hand, Link2, PanelLeft, PanelRight } from "lucide-react";
import { PresenceAvatar } from "@/components/room/PresenceAvatar";
import { FPS, mix, prog, sec } from "../time";
import { AVI, HIMANSHU, PEOPLE, REPO, RUN_1, T, type Person } from "../script";
import { breathe } from "./motion";
import { asking, changedFiles, mixHex, present, statusAt } from "./state";

// The room's header at its narrow density, as the landing demo draws it.
// The room's header: full density in a wide window (wordmark, title, labelled
// share), the landing demo's narrow density in a half one.
export function Header({ f, viewer, wide }: { f: number; viewer: Person; wide: boolean }) {
  const status = statusAt(f);
  const changes = changedFiles(f);
  return (
    <header className="room-head">
      <div className="room-head-left">
        <span className="rbtn rbtn--icon droom-wide">
          <PanelLeft size={16} />
        </span>
        {wide && <span className="room-wordmark">relay</span>}
        <span className="room-crumb">
          <GitBranch size={14} />
          <span className="room-crumb-name">{REPO}</span>
          <ChevronDown size={13} />
        </span>
        {wide && f >= RUN_1.start && (
          <>
            <span className="room-head-sep">/</span>
            <span className="room-title">{RUN_1.text}</span>
          </>
        )}
        <span className="rstatus" data-kind={status.kind}>
          {status.kind === "done" ? (
            <Check size={13} strokeWidth={2.5} />
          ) : (
            <span className="rstatus-dot" style={status.kind === "working" ? { opacity: breathe(f, FPS) } : undefined} />
          )}
          <span className="rstatus-label">{status.kind === "idle" ? "Ready" : status.kind === "done" ? "Done" : "Working"}</span>
          {status.clock && <span className="rstatus-time">{status.clock}</span>}
        </span>
      </div>
      <div className="room-head-right">
        <Roster f={f} viewer={viewer} wide={wide} />
        <span className={wide ? "rbtn rbtn--secondary" : "rbtn rbtn--secondary droom-wide droom-share"}>
          <Link2 size={14} />
          {wide && <span className="share-label">Share</span>}
        </span>
        <span className="rbtn rbtn--icon room-panel-toggle" aria-pressed={wide || undefined}>
          <PanelRight size={16} />
          {changes > 0 && <span className="count">{changes}</span>}
        </span>
      </div>
    </header>
  );
}

// DemoRoster's geometry (presence.css): 24px discs overlapping 2px, the driver's
// slot opened 3px each side so its ring, 4px proud, clears its neighbours.
const DISC = 24;
const OVERLAP = 2;
const OPEN = 3;
const RING = 4;

function slotX(i: number, driver: number): number {
  const base = i * (DISC - OVERLAP);
  if (i < driver) return base;
  const lead = driver > 0 ? OPEN + OVERLAP : OPEN;
  return i === driver ? base + lead : base + lead + OPEN + OPEN + OVERLAP;
}

function Roster({ f, viewer, wide }: { f: number; viewer: Person; wide: boolean }) {
  const people = present(f);
  // The ring glides between seats over the room's 420ms.
  const p = prog(f, T.handOver, sec(0.42));
  const x = (i: number) => mix(slotX(i, 0), slotX(i, 1), p);
  const alone = slotX(0, 0) + DISC + OPEN;
  const pair = mix(slotX(1, 0) + DISC, slotX(1, 1) + DISC + OPEN, p);
  // Himanshu's disc arrives with him; on his own screen he was always there.
  const arrive = viewer.id === AVI.id ? prog(f, T.himanshuJoins, sec(0.3)) : 1;
  const ringAt = mix(slotX(0, 0), slotX(1, 1), p) - RING;
  const lead = p < 0.5 ? 0 : 1;

  return (
    <span className="roster droom-roster">
      <span className="roster-stack droom-stack" style={{ width: people.length > 1 ? mix(alone, pair, arrive) : alone }}>
        {PEOPLE.filter((person) => people.includes(person)).map((person, i) => (
          <span
            key={person.id}
            className="roster-slot droom-slot"
            style={
              {
                "--hue": person.hue,
                "--x": `${x(i)}px`,
                zIndex: i === lead ? 1 : undefined,
                opacity: i === 1 ? arrive : 1,
              } as CSSProperties
            }
          >
            <PresenceAvatar participant={{ displayName: person.name }} hue={person.hue} />
            {viewer.id === AVI.id && i === 1 && asking(f) && (
              <span className="roster-asking" style={{ opacity: prog(f, T.requestShows, sec(0.2)) }}>
                <Hand size={9} strokeWidth={2.5} />
              </span>
            )}
          </span>
        ))}
        <span
          className="wheel-ring droom-ring"
          style={{ "--hue": mixHex(AVI.hue, HIMANSHU.hue, p), "--x": `${ringAt}px` } as CSSProperties}
        />
      </span>
      {wide && (
        <span className="roster-label" style={{ "--hue": AVI.hue } as CSSProperties}>
          <b>{viewer.id === AVI.id ? "You" : AVI.name}</b> {viewer.id === AVI.id ? "have" : "has"} the wheel
        </span>
      )}
    </span>
  );
}
