import type { CSSProperties, ReactNode } from "react";
import { ArrowUp, Check, ChevronDown, CornerDownLeft, GitBranch, Link2, Square } from "lucide-react";
import { DriverAvatar, PresenceAvatar } from "@/components/room/PresenceAvatar";
import { caretOn, prog, sec, typedText } from "../time";
import { AVI, HIMANSHU, MODEL, REPO, RUN_1, RUN_2, T, type Person, type Run } from "../script";
import { Grow } from "./motion";
import { asking, driverAt, present, statusAt } from "./state";

// Which control the viewer's pointer is over or pressing, by its data-t id.
export type Hot = { hover: string | null; press: string | null };

function hotProps(id: string, hot: Hot) {
  return { "data-t": id, "data-hover": hot.hover === id || undefined, "data-press": hot.press === id || undefined };
}

// The run this viewer is typing, if any, and when their composer holds focus.
const TYPING: Record<string, { run: Run; focus: number; blur: number }> = {
  [AVI.id]: { run: RUN_1, focus: T.aviFocus, blur: T.inviteClick },
  [HIMANSHU.id]: { run: RUN_2, focus: T.himanshuFocus, blur: Number.POSITIVE_INFINITY },
};

// components/room/Dock.tsx as one person sees it at frame f.
export function Dock({ f, viewer, hot }: { f: number; viewer: Person; hot: Hot }) {
  const driver = driverAt(f);
  const isDriver = driver.id === viewer.id;
  const working = statusAt(f).kind === "working";

  // The request reaches the driver alone, and folds away once it's answered.
  const request =
    viewer.id === AVI.id
      ? asking(f)
        ? prog(f, T.requestShows, sec(0.28))
        : f >= T.handOver
          ? 1 - prog(f, T.handOver, sec(0.22))
          : 0
      : 0;

  const typing = TYPING[viewer.id];
  const focused = f >= typing.focus && f < typing.blur;
  const typingNow = f >= typing.run.typeAt && f < typing.run.start;
  const text = typingNow ? typedText(typing.run.text, typing.run.strokes, f, typing.run.typeAt) : "";
  const lastKey = typingNow ? typing.run.typeAt + (typing.run.strokes[Math.max(0, text.length - 1)] ?? 0) : typing.focus;

  return (
    <div className="dock">
      <div className="dock-card" data-focus={focused || undefined}>
        <Grow p={request} rise={0}>
          <div className="request" style={{ "--hue": HIMANSHU.hue } as CSSProperties}>
            <PresenceAvatar participant={{ displayName: HIMANSHU.name }} hue={HIMANSHU.hue} size="sm" />
            <span className="request-text">
              <b>{HIMANSHU.name}</b> is asking for the wheel
            </span>
            <span className="rbtn rbtn--primary rbtn--sm" {...hotProps("avi-grant", hot)}>
              Hand over
            </span>
          </div>
        </Grow>

        <div className="strip">
          <Who f={f} viewer={viewer} />
          <div className="strip-actions">
            <Actions f={f} viewer={viewer} isDriver={isDriver} hot={hot} />
          </div>
        </div>

        <div className="composer">
          <div className="composer-input" {...hotProps(`${viewer.id}-composer`, hot)}>
            {text ? (
              <>
                {text}
                {focused && caretOn(f, lastKey) && <span className="tour-caret" />}
              </>
            ) : (
              <>
                {focused && caretOn(f, lastKey) && <span className="tour-caret tour-caret--lead" />}
                <span className="tour-placeholder">
                  {isDriver
                    ? working
                      ? "Queue the next instruction…"
                      : `Ask the agent to do something in ${REPO}…`
                    : `Suggest something to ${driver.name}…`}
                </span>
              </>
            )}
          </div>
          <div className="composer-bar">
            <div className="composer-context">
              <span className="composer-chip">
                <GitBranch size={13} />
                <span className="composer-chip-text">{REPO}</span>
              </span>
              <span className="composer-chip" data-agent="live">
                <span className="agent-dot" />
                {MODEL}
              </span>
            </div>
            <div className="composer-actions">
              <span className="composer-hint" style={{ opacity: focused ? 1 : 0 }}>
                <kbd>
                  <CornerDownLeft size={11} />
                </kbd>
                {isDriver ? (working ? "to queue" : "to send") : "to suggest"}
              </span>
              {isDriver && working && (
                <span className="rbtn rbtn--ghost rbtn--sm composer-stop">
                  <Square size={9} fill="currentColor" />
                  Stop
                </span>
              )}
              {isDriver ? (
                <button type="button" className="composer-send" disabled={!text}>
                  <ArrowUp size={17} strokeWidth={2.25} />
                </button>
              ) : (
                <button type="button" className="rbtn rbtn--primary rbtn--sm composer-suggest" disabled>
                  Suggest
                  <ArrowUp size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// DriverStrip's swap: the old name lifts away as the new one rises in (SWAP, 220ms).
function Who({ f, viewer }: { f: number; viewer: Person }) {
  const p = prog(f, T.handOver, sec(0.22));
  if (f < T.handOver || p >= 1) return <WhoLine f={f} viewer={viewer} driver={driverAt(f)} />;
  return (
    <div className="tour-swap">
      <WhoLine f={f} viewer={viewer} driver={AVI} style={{ opacity: 1 - p, transform: `translateY(${-8 * p}px)` }} />
      <WhoLine
        f={f}
        viewer={viewer}
        driver={HIMANSHU}
        style={{ opacity: p, transform: `translateY(${8 * (1 - p)}px)` }}
      />
    </div>
  );
}

function WhoLine({ f, viewer, driver, style }: { f: number; viewer: Person; driver: Person; style?: CSSProperties }) {
  const isDriver = driver.id === viewer.id;
  const others = present(f).filter((p) => p.id !== viewer.id).length;
  const meta = isDriver ? (others > 0 ? ` · ${others} watching` : " · just you so far") : " · you're watching";
  return (
    <div className="strip-who" style={{ "--hue": driver.hue, ...style } as CSSProperties}>
      <DriverAvatar participant={{ displayName: driver.name }} hue={driver.hue} size="sm" />
      <span className="strip-text">
        <b>{isDriver ? "You" : driver.name}</b> {isDriver ? "have the wheel" : "has the wheel"}
        <span className="strip-meta">{meta}</span>
      </span>
    </div>
  );
}

function Actions({ f, viewer, isDriver, hot }: { f: number; viewer: Person; isDriver: boolean; hot: Hot }): ReactNode {
  if (isDriver) {
    if (present(f).length === 1) {
      const copied = f >= T.inviteClick;
      return (
        <span className="rbtn rbtn--ghost rbtn--sm" data-copied={copied || undefined} {...hotProps("avi-invite", hot)}>
          {copied ? <Check size={13} /> : <Link2 size={13} />}
          {copied ? "Link copied" : "Invite someone"}
        </span>
      );
    }
    return (
      <>
        <span className="rbtn rbtn--secondary rbtn--sm">
          Hand over
          <ChevronDown size={13} />
        </span>
        <span className="rbtn rbtn--ghost rbtn--sm">Release</span>
      </>
    );
  }
  const driver = driverAt(f);
  if (viewer.id === HIMANSHU.id && f >= T.askClick) {
    return (
      <>
        <span className="strip-waiting">Asked {driver.name}</span>
        <span className="rbtn rbtn--ghost rbtn--sm">Cancel</span>
      </>
    );
  }
  return (
    <span className="rbtn rbtn--secondary rbtn--sm" {...hotProps(`${viewer.id}-ask`, hot)}>
      Ask for the wheel
    </span>
  );
}
