import { Check, ChevronDown, GitBranch, Link2, PanelLeft, PanelRight } from "lucide-react";
import { DemoRoster } from "./DemoRoster";
import { clock, type DemoFrame, type Person } from "./model";

// The room's header at a narrow width: no wordmark or title, share as an icon.
export function DemoHeader({
  frame,
  people,
  selfId,
  repo,
}: {
  frame: DemoFrame;
  people: Person[];
  selfId: string;
  repo: string;
}) {
  return (
    <header className="room-head">
      <div className="room-head-left">
        <span className="rbtn rbtn--icon droom-wide">
          <PanelLeft size={16} />
        </span>
        <span className="room-crumb">
          <GitBranch size={14} />
          <span className="room-crumb-name">{repo}</span>
          <ChevronDown size={13} />
        </span>
        <span className="rstatus" data-kind={frame.working ? "working" : "done"}>
          {frame.working ? <span className="rstatus-dot" /> : <Check size={13} strokeWidth={2.5} />}
          <span className="rstatus-label">{frame.working ? "Working" : "Done"}</span>
          {frame.working && <span className="rstatus-time">{clock(frame.elapsed)}</span>}
        </span>
      </div>
      <div className="room-head-right">
        <DemoRoster
          people={people}
          driverId={frame.driverId}
          // Requests go to the driver alone, so only their roster shows the hand.
          asking={frame.driverId === selfId ? frame.asking : null}
        />
        <span className="rbtn rbtn--secondary droom-wide droom-share">
          <Link2 size={14} />
        </span>
        <span className="rbtn rbtn--icon room-panel-toggle">
          <PanelRight size={16} />
          {frame.changes > 0 && <span className="count">{frame.changes}</span>}
        </span>
      </div>
    </header>
  );
}
