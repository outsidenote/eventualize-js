export function RiskMeter({ risk }: { readonly risk: number }) {
  const level = Math.min(10, Math.max(0, risk));
  const pct = Math.min(100, Math.max(0, risk * 10));
  // Stretch the gradient over the full track so the fill's end color matches the level.
  const backgroundSize = pct > 0 ? `${(100 / pct) * 100}% 100%` : "100% 100%";
  return (
    <div className="risk" title={`risk ${risk} / 10`}>
      <span className="risk-label">risk {risk}</span>
      <div
        className="risk-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={level}
        aria-label="risk"
      >
        <div className="risk-fill" style={{ width: `${pct}%`, backgroundSize }} />
      </div>
    </div>
  );
}
