import { T } from "./script";

const GITHUB =
  "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z";

// The landing's hero copy column, in the landing's own classes, as it reads in a
// narrow window. The live demo beside it is left out: this window is about the command.
export function Landing({ f, hover, press }: { f: number; hover: boolean; press: boolean }) {
  // CommandBlock resets after 1.6s; by then this window is behind the terminal.
  const copied = f >= T.copyClick;
  return (
    <div className="mini">
      <header className="mini-nav">
        <span className="landing-mark">relay</span>
        <span className="mini-nav-actions">
          <span className="btn-quiet landing-nav-gh">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
              <path d={GITHUB} />
            </svg>
            <span>GitHub</span>
          </span>
          <span className="btn-solid landing-nav-cta">Get started</span>
        </span>
      </header>
      <div className="mini-hero">
        <span className="badge hero-eyebrow">
          <span className="badge-dot" />
          Live multiplayer
        </span>
        <h1 className="hero-title">
          Watch an agent work.
          <br />
          <em>Together.</em>
        </h1>
        <p className="hero-sub">
          Everyone on the link watches the same agent session as it runs. One person has the wheel, everyone else
          can suggest the next step, and the wheel can change hands mid-task.
        </p>
        <div className="hero-cta">
          <span className="cmd" data-t="cmd" data-hover={hover || undefined} data-press={press || undefined}>
            <span className="cmd-prompt">$</span>
            <code className="cmd-text">npx relayrun</code>
            <span className={`cmd-state ${copied ? "cmd-state--on" : ""}`}>{copied ? "Copied" : "Copy"}</span>
          </span>
          <span className="hero-cta-note">
            Run it in any git repository. It prints a link to share, and the agent works in a sandboxed clone on
            your machine. Needs an Anthropic API key or a Claude Code login.
          </span>
        </div>
      </div>
    </div>
  );
}
