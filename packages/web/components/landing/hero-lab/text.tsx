import type { CSSProperties } from "react";
import { useEnters } from "../demo-room/motion";

// Only text that arrives during playback animates; the first paint, and every
// reduced-motion visitor, gets it whole.

// Words fade in on a stagger, the way a streamed answer reads.
export function Words({ text }: { text: string }) {
  const enters = useEnters();
  if (!enters) return <>{text}</>;
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i} className="lab-word" style={{ "--d": `${i * 55}ms` } as CSSProperties}>
          {w}{" "}
        </span>
      ))}
    </>
  );
}

// Characters land one at a time: someone typing, not a model streaming.
export function Typed({ text }: { text: string }) {
  const enters = useEnters();
  if (!enters) return <>{text}</>;
  return (
    <>
      {[...text].map((c, i) => (
        <span key={i} className="lab-char" style={{ "--d": `${i * 34}ms` } as CSSProperties}>
          {c}
        </span>
      ))}
    </>
  );
}

const KEYWORD = /\b(export|function|const|return|new)\b/g;

// Greyscale by design: keywords lift to white, everything else stays dim.
function Line({ text }: { text: string }) {
  const parts = text.split(KEYWORD);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : p))}
    </>
  );
}

export function Code({ lines }: { lines: string[] }) {
  const enters = useEnters();
  return (
    <pre className="lab-code">
      {lines.map((line, i) => (
        <span
          key={i}
          className="lab-line"
          data-enter={enters || undefined}
          style={{ "--d": `${i * 220}ms` } as CSSProperties}
        >
          <Line text={line} />
        </span>
      ))}
    </pre>
  );
}
