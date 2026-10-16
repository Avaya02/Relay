import type { CSSProperties, ReactNode } from "react";
import { ArrowUp, ChevronDown, GitBranch, ShipWheel, Square, X } from "lucide-react";
import { DriverAvatar, PresenceAvatar } from "@/components/room/PresenceAvatar";
import { Reveal, useEnters, useHeld } from "./motion";
import type { DemoFrame, Person } from "./model";

// The room's Dock as one person sees it: the request row reaches the driver
// only, and the controls follow whoever has the wheel.
export function DemoDock({
  frame,
  people,
  selfId,
  repo,
  model,
}: {
  frame: DemoFrame;
  people: Person[];
  selfId: string;
  repo: string;
  model: string;
}) {
  const find = (id: string) => people.find((p) => p.id === id) ?? people[0];
  const driver = frame.driverId ? find(frame.driverId) : null;
  const isDriver = frame.driverId === selfId;
  const asker = isDriver && frame.asking ? find(frame.asking) : null;
  const shownAsker = useHeld(asker, asker !== null);
  const suggestions = useHeld(frame.suggestions, frame.suggestions.length > 0);

  return (
    <div className="dock">
      <div className="dock-card">
        <Reveal open={asker !== null}>
          {shownAsker && (
            <div className="request" style={{ "--hue": shownAsker.hue } as CSSProperties}>
              <PresenceAvatar participant={{ displayName: shownAsker.name }} hue={shownAsker.hue} size="sm" />
              <span className="request-text">
                <b>{shownAsker.name}</b> is asking for the wheel
              </span>
              <button type="button" className="rbtn rbtn--primary rbtn--sm">
                Hand over
              </button>
            </div>
          )}
        </Reveal>

        <div className="strip">
          <Who key={frame.driverId ?? "nobody"} hue={driver?.hue}>
            {driver ? (
              <>
                <DriverAvatar participant={{ displayName: driver.name }} hue={driver.hue} size="sm" />
                <span className="strip-text">
                  <b>{isDriver ? "You" : driver.name}</b> {isDriver ? "have the wheel" : "has the wheel"}
                  <span className="strip-meta">
                    {isDriver ? ` · ${people.length - 1} watching` : " · you're watching"}
                  </span>
                </span>
              </>
            ) : (
              <>
                <span className="strip-nowheel">
                  <ShipWheel size={12} />
                </span>
                <span className="strip-text">Nobody has the wheel</span>
              </>
            )}
          </Who>
          <div className="strip-actions">
            {isDriver ? (
              <>
                <button type="button" className="rbtn rbtn--secondary rbtn--sm">
                  Hand over
                  <ChevronDown size={13} />
                </button>
                <button type="button" className="rbtn rbtn--ghost rbtn--sm">
                  Release
                </button>
              </>
            ) : !driver ? (
              <button type="button" className="rbtn rbtn--primary rbtn--sm">
                <ShipWheel size={14} />
                Take the wheel
              </button>
            ) : frame.asking === selfId ? (
              <>
                <span className="strip-waiting">Asked {driver.name}</span>
                <button type="button" className="rbtn rbtn--ghost rbtn--sm">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="rbtn rbtn--secondary rbtn--sm">
                Ask for the wheel
              </button>
            )}
          </div>
        </div>

        <Reveal open={frame.suggestions.length > 0}>
          <section className="sugg">
            <div className="sugg-head">
              <span>Suggestions</span>
              <span className="count">{suggestions.length}</span>
              {isDriver && <span className="sugg-hint">Send one to run it next</span>}
            </div>
            <ul className="sugg-list">
              {suggestions.map((s) => {
                const by = find(s.by);
                const mine = s.by === selfId;
                return (
                  <li key={s.id} className="sugg-item" style={{ "--hue": by.hue } as CSSProperties}>
                    <div className="sugg-row">
                      <PresenceAvatar participant={{ displayName: by.name }} hue={by.hue} size="xs" />
                      <div className="sugg-body">
                        <span className="sugg-by">{mine ? "You" : by.name}</span>
                        <p className="sugg-text">{s.text}</p>
                      </div>
                      <div className="sugg-actions">
                        {isDriver && (
                          <button type="button" className="rbtn rbtn--secondary rbtn--xs">
                            <ArrowUp size={12} />
                            Send
                          </button>
                        )}
                        {(isDriver || mine) && (
                          <button type="button" className="rbtn rbtn--icon rbtn--xs sugg-dismiss">
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </Reveal>

        <Composer
          mode={isDriver ? "send" : "suggest"}
          working={frame.working}
          repo={repo}
          model={model}
          driverName={driver && !isDriver ? driver.name : null}
        />
      </div>
    </div>
  );
}

// Keyed on the driver, so a handover slides the new name in as the room does.
function Who({ hue, children }: { hue?: string; children: ReactNode }) {
  const enters = useEnters();
  return (
    <div
      className="strip-who"
      data-swap={enters || undefined}
      style={hue ? ({ "--hue": hue } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

function Composer({
  mode,
  working,
  repo,
  model,
  driverName,
}: {
  mode: "send" | "suggest";
  working: boolean;
  repo: string;
  model: string;
  driverName: string | null;
}) {
  const placeholder =
    mode === "suggest"
      ? driverName
        ? `Suggest something to ${driverName}…`
        : "Suggest an instruction for whoever takes the wheel…"
      : working
        ? "Queue the next instruction…"
        : `Ask the agent to do something in ${repo}…`;

  return (
    <div className="composer">
      <div className="composer-input droom-placeholder">{placeholder}</div>
      <div className="composer-bar">
        <div className="composer-context">
          <span className="composer-chip">
            <GitBranch size={13} />
            <span className="composer-chip-text">{repo}</span>
          </span>
          <span className="composer-chip" data-agent="live">
            <span className="agent-dot" />
            {model}
          </span>
        </div>
        <div className="composer-actions">
          {mode === "send" && working && (
            <button type="button" className="rbtn rbtn--ghost rbtn--sm composer-stop">
              <Square size={9} fill="currentColor" />
              Stop
            </button>
          )}
          {mode === "suggest" ? (
            <button type="button" className="rbtn rbtn--primary rbtn--sm composer-suggest" disabled>
              Suggest
              <ArrowUp size={14} />
            </button>
          ) : (
            <button type="button" className="composer-send" disabled>
              <ArrowUp size={17} strokeWidth={2.25} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
