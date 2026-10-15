import type { DetectorKind } from "../api/types";
import type { Detection } from "../useDetection";
import { DETECTORS, detectorDef } from "./detectors";

function toKind(v: string): DetectorKind {
  return DETECTORS.find((d) => d.kind === v)?.kind ?? "riskJump";
}

type Props = { readonly detection: Detection; readonly onMatch: (offset: number) => void };

export function DetectionCard({ detection: d, onMatch }: Props) {
  const def = detectorDef(d.kind);
  const n = d.matches.length;
  const current = d.matches[d.index];
  const go = (offset: number | null) => {
    if (offset !== null) onMatch(offset);
  };
  return (
    <div className="card detect">
      <h3>detection</h3>
      <div className="row">
        <select
          aria-label="detector"
          value={d.kind}
          onChange={(e) => d.setKind(toKind(e.target.value))}
        >
          {DETECTORS.map((x) => (
            <option key={x.kind} value={x.kind}>
              {x.label}
            </option>
          ))}
        </select>
        {def.params.map((p) => (
          <label key={p.key}>
            {p.label}{" "}
            <input
              type="number"
              step="any"
              value={d.inputs[p.key] ?? ""}
              onChange={(e) => d.setInput(p.key, e.target.value)}
            />
          </label>
        ))}
        <button className="primary" disabled={d.running} onClick={() => void d.run().then(go)}>
          🔎 Detect
        </button>
      </div>
      <div className="row" style={{ margin: 0 }}>
        <button disabled={n === 0 || d.index <= 0} onClick={() => go(d.step(-1))}>
          ◀ prev
        </button>
        <span className="mono" role="status" aria-live="polite">
          {d.running
            ? "detecting…"
            : n > 0 && current !== undefined
              ? `match ${d.index + 1} / ${n} · offset ${current}`
              : d.searched
                ? "no matches"
                : "—"}
        </span>
        <button disabled={n === 0 || d.index >= n - 1} onClick={() => go(d.step(1))}>
          next ▶
        </button>
      </div>
      <div aria-live="polite">
        {d.truncated && (
          <p className="dim small">results truncated (scan or match limit reached)</p>
        )}
        {d.stale && <p className="warn small">results outdated — detect again</p>}
        {d.error !== null && <p className="error">{d.error}</p>}
      </div>
    </div>
  );
}
