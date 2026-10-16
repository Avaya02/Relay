import type { CSSProperties } from "react";
import { ArrowUpRight, Link2 } from "lucide-react";
import { DriverAvatar } from "@/components/room/PresenceAvatar";
import { AVI, MODEL, REPO } from "../script";

// components/room/Intro.tsx as the host first sees it: alone, with the wheel,
// and a live agent billed to their key.
const EXAMPLES = [
  "Summarize what this repository does and how it's laid out",
  "Find the three largest source files and suggest how to split them",
  "Run the test suite and report what fails and why",
];

export function Intro({ opacity }: { opacity: number }) {
  return (
    <div className="tour-intro" style={{ opacity }}>
      <div className="intro">
        <h2 className="intro-title">
          Ready in <span className="intro-repo">{REPO}</span>
        </h2>
        <p className="intro-lede">
          Everyone with the link sees this run live. You have the wheel: what you send runs on the host&apos;s
          machine and streams here step by step.
        </p>
        <dl className="intro-facts">
          <div className="intro-row">
            <dt>People</dt>
            <dd>
              <span className="intro-avatars">
                <DriverAvatar participant={{ displayName: AVI.name }} hue={AVI.hue} size="sm" />
              </span>
              <span className="intro-names">Just you so far</span>
              <span className="rbtn rbtn--ghost rbtn--sm">
                <Link2 size={13} />
                Invite someone
              </span>
            </dd>
          </div>
          <div className="intro-row">
            <dt>Agent</dt>
            <dd>
              <span className="intro-agent-line">
                <span className="agent-dot" data-agent="live" />
                <b>{MODEL}</b>
                <span className="intro-dim">on the host&apos;s machine, billed to the key ending ··7f3a</span>
              </span>
            </dd>
          </div>
        </dl>
        <section className="intro-try" style={{ "--hue": AVI.hue } as CSSProperties}>
          <h3 className="intro-try-title">Try asking</h3>
          <ul className="intro-examples">
            {EXAMPLES.map((text) => (
              <li key={text}>
                <span className="intro-example">
                  <span>{text}</span>
                  <ArrowUpRight size={14} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
