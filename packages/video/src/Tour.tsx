import { AbsoluteFill, useCurrentFrame } from "remotion";
import { AVI_HALF, AVI_WIDE, FULL, HIMANSHU_HALF, TERM_WIN, cameraAt, cameraTransform } from "./camera";
import { Cursor } from "./Cursor";
import { AVI_CURSOR, HIMANSHU_CURSOR, hovered, pressed } from "./cursors";
import { FONT_ROOT } from "./fonts";
import { Landing } from "./Landing";
import { Measure } from "./Measure";
import { Room } from "./room/Room";
import { AVI, DURATION, HIMANSHU, SESSION_URL, T } from "./script";
import { Terminal } from "./Terminal";
import { EASE_UI, mix, prog, sec } from "./time";
import { BrowserWindow, TerminalWindow } from "./windows";

const AVI_CLICKS: [number, string][] = [
  [T.copyClick, "cmd"],
  [T.linkClick, "link"],
  [T.aviFocus, "avi-composer"],
  [T.inviteClick, "avi-invite"],
  [T.handOverClick, "avi-grant"],
];
const HIMANSHU_CLICKS: [number, string][] = [
  [T.askClick, "himanshu-ask"],
  [T.himanshuFocus, "himanshu-composer"],
];

// The poster: both screens at the moment of the ask, a frame the film itself
// never holds in a wide shot.
const POSTER = { f: T.requestShows + sec(0.55), camera: FULL };

export function Tour({ measure = false, poster = false }: { measure?: boolean; poster?: boolean }) {
  const frame = useCurrentFrame();
  const f = poster ? POSTER.f : frame;
  const camera = poster ? POSTER.camera : cameraAt(f);
  const aviHot = { hover: hovered(AVI_CLICKS, f), press: pressed(AVI_CLICKS, f) };
  const himanshuHot = { hover: hovered(HIMANSHU_CLICKS, f), press: pressed(HIMANSHU_CLICKS, f) };

  // The terminal comes forward with a short dissolve over the page. When the link
  // opens, the browser covers it outright: a dissolve there ghosted two screens of
  // text through each other.
  const termIn = prog(f, T.termRaise, sec(0.12));
  const termOpacity = f < T.roomRaise ? termIn : 0;
  // Himanshu opening the link is a cut to the split screen; his window settles in.
  const split = f >= T.himanshuJoins;
  const join = prog(f, T.himanshuJoins, sec(0.45), EASE_UI);
  // Fades to the desk at both ends, so the loop meets itself.
  const veil = poster ? 0 : Math.max(1 - prog(f, 0, sec(0.35)), prog(f, DURATION - sec(0.6), sec(0.6)));

  return (
    <AbsoluteFill className="dark tour">
      <style>{FONT_ROOT}</style>
      <div className="desk" style={{ transform: cameraTransform(camera) }}>
        <BrowserWindow rect={split ? AVI_HALF : AVI_WIDE} url={f < T.roomRaise ? "relayrun.in" : SESSION_URL} owner={AVI}>
          {f < T.roomRaise ? (
            <Landing f={f} hover={aviHot.hover === "cmd"} press={aviHot.press === "cmd"} />
          ) : (
            <Room f={f} viewer={AVI} hot={aviHot} wide={!split} />
          )}
        </BrowserWindow>
        {termOpacity > 0 && (
          <TerminalWindow
            rect={TERM_WIN}
            title="api — relayrun"
            style={{ opacity: termOpacity, transform: `scale(${mix(0.985, 1, termIn)})` }}
          >
            <Terminal f={f} hover={aviHot.hover === "link"} />
          </TerminalWindow>
        )}
        {split && (
          <BrowserWindow
            rect={HIMANSHU_HALF}
            url={SESSION_URL}
            owner={HIMANSHU}
            style={{ opacity: join, transform: `translateX(${(1 - join) * 24}px)` }}
          >
            <Room f={f} viewer={HIMANSHU} hot={himanshuHot} />
          </BrowserWindow>
        )}
        <Cursor plan={AVI_CURSOR} f={f} />
        <Cursor plan={HIMANSHU_CURSOR} f={f} />
      </div>
      {veil > 0 && <AbsoluteFill style={{ background: "#141414", opacity: veil }} />}
      {measure && <Measure scale={camera.s} />}
    </AbsoluteFill>
  );
}
