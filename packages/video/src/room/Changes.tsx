import { FileDiff, PanelRightClose } from "lucide-react";
import { sec } from "../time";
import { RUNS, stepAt } from "./state";

// Line counts the session's diff would report for each edit; scripted, like the run.
const DIFF: Record<string, { add: number; del: number }> = {
  "src/db/users.ts": { add: 9, del: 3 },
  "src/routes/users.ts": { add: 14, del: 2 },
  "src/routes/users.test.ts": { add: 24, del: 0 },
};

// The diff is measured a moment after the edit lands; until then the row has no stats.
const MEASURED = sec(0.35);

function Stat({ kind, value }: { kind: "add" | "del"; value: number }) {
  return (
    <span className="stat" data-kind={value === 0 ? "zero" : kind}>
      {kind === "add" ? "+" : "−"}
      {value}
    </span>
  );
}

// components/changes/ChangesRail.tsx at its default 272px.
export function Changes({ f }: { f: number }) {
  const files: { path: string; measured: boolean }[] = [];
  for (const run of RUNS) {
    for (const step of run.steps) {
      const done = stepAt(run, step.done);
      if (step.verb !== "edited" || f < done || files.some((x) => x.path === step.target)) continue;
      files.push({ path: step.target, measured: f >= done + MEASURED });
    }
  }
  const measured = files.filter((x) => x.measured);
  const add = measured.reduce((n, x) => n + DIFF[x.path].add, 0);
  const del = measured.reduce((n, x) => n + DIFF[x.path].del, 0);

  return (
    <aside className="crail" style={{ width: 272 }}>
      <div className="crail-head">
        <h2 className="crail-title">Changes</h2>
        {files.length > 0 && <span className="count">{files.length}</span>}
        {measured.length > 0 && (
          <span className="crail-sum">
            <Stat kind="add" value={add} />
            <Stat kind="del" value={del} />
          </span>
        )}
        <span className="rbtn rbtn--icon rbtn--sm crail-close">
          <PanelRightClose size={15} />
        </span>
      </div>
      <div className="crail-body">
        {files.length === 0 ? (
          <div className="crail-empty">
            <FileDiff size={18} />
            <p>
              <b>No changes yet</b>
              Files the agent writes appear here as it works, each with its diff.
            </p>
          </div>
        ) : (
          <ul className="crail-list">
            {files.map(({ path, measured: ready }) => {
              const cut = path.lastIndexOf("/") + 1;
              return (
                <li key={path}>
                  <div className="crail-row">
                    <span className="fmark" data-status={ready ? "modified" : "pending"}>
                      {ready ? "M" : "·"}
                    </span>
                    <span className="crail-path">
                      <span className="crail-dir">{path.slice(0, cut)}</span>
                      <span className="crail-base">{path.slice(cut)}</span>
                    </span>
                    {ready && (
                      <span className="crail-stats">
                        <Stat kind="add" value={DIFF[path].add} />
                        <Stat kind="del" value={DIFF[path].del} />
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
