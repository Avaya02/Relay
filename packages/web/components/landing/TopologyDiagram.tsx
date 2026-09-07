// The trust section claims the repository never leaves your machine. That is
// an architecture claim, and the right form for one is a diagram — not a
// screenshot, which can only show a surface, and not a component, because
// there is no Relay surface that renders its own topology.
//
// The whole point is the boundary: everything expensive stays left of it, and
// what crosses is a description of what happened. So the boundary is the only
// element drawn with any weight.

export function TopologyDiagram() {
  return (
    <div className="on-photo on-photo--trust" aria-hidden>
      <div className="topo">
        <div className="topo-side">
          <span className="topo-label">Your machine</span>
          <ul className="topo-items">
            <li>repository</li>
            <li>shell</li>
            <li>credentials</li>
            <li>the agent</li>
          </ul>
        </div>

        <div className="topo-link">
          <span className="topo-wire" />
          <span className="topo-payload">events only</span>
          <span className="topo-wire" />
        </div>

        <div className="topo-side topo-side--remote">
          <span className="topo-label">Relay</span>
          <ul className="topo-items">
            <li>ordering</li>
            <li>the driver lock</li>
            <li>fan-out</li>
            <li className="topo-absent">no repository</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
