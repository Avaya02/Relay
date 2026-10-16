import { caretOn, sec } from "./time";
import { BANNER, CONNECTED, LINK_LINE, T } from "./script";

const COMMAND = "npx relayrun";
// console.log prints the banner at once; a few frames apart reads as output arriving.
const LINE_GAP = 2;

export function Terminal({ f, hover }: { f: number; hover: boolean }) {
  const pasted = f >= T.paste;
  const entered = f >= T.enter;
  const lines = entered ? BANNER.filter((_, i) => f >= T.banner + i * LINE_GAP) : [];
  const connected = f >= T.connected;
  const lastActivity = connected ? T.connected : entered ? T.enter : pasted ? T.paste : 0;
  const caret = caretOn(f, lastActivity) ? <span className="term-caret" /> : <span className="term-caret term-caret--off" />;

  return (
    <div className="term-body">
      <div>
        <span className="term-dim">~/code/api</span> % {pasted && COMMAND}
        {!entered && caret}
      </div>
      {lines.map((line, i) => (
        <div key={i}>
          {i === LINK_LINE ? (
            <>
              {line.slice(0, line.indexOf("https"))}
              <span className="term-link" data-t="link" data-hover={hover || undefined}>
                {line.slice(line.indexOf("https"))}
              </span>
            </>
          ) : (
            line || " "
          )}
        </div>
      ))}
      {connected && <div>{CONNECTED}</div>}
      {entered && f >= T.banner + BANNER.length * LINE_GAP + sec(0.1) && <div>{caret}</div>}
    </div>
  );
}
