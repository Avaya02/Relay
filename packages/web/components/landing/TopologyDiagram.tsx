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
