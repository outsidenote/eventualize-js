import type { PlaygroundViews } from "../api/types";
import { formatAmount } from "../format";
import { Delta } from "../ui/DeltaBadge";
import { RiskMeter } from "../ui/RiskMeter";

type Props = {
  readonly offset: number;
  readonly lastOffset: number;
  readonly views: PlaygroundViews;
  readonly previous: PlaygroundViews | null;
};

export function OffsetWidget({ offset, lastOffset, views, previous }: Props) {
  const deg = lastOffset > 0 ? (offset / lastOffset) * 360 : 360;
  return (
    <div className="card widget">
      <h3>offset</h3>
      <div className="row between" style={{ margin: 0 }}>
        <span className="row" style={{ margin: 0 }}>
          <span
            className="ring"
            role="img"
            style={{
              background: `conic-gradient(var(--accent) ${deg}deg, rgb(255 255 255 / 0.1) 0)`,
            }}
            aria-label={`offset ${offset} of ${lastOffset}`}
          >
            <span className="ring-inner">{offset}</span>
          </span>
          <span className="dim">of {lastOffset}</span>
        </span>
        <span className="big">
          {formatAmount(views.balance.amount, views.balance.currency)}{" "}
          <Delta current={views.balance.amount} previous={previous?.balance.amount ?? null} />
        </span>
      </div>
      <RiskMeter risk={views.risk} />
      {previous !== null && previous.risk !== views.risk && (
        <div className="dim small">
          risk <Delta current={views.risk} previous={previous.risk} /> vs previous
        </div>
      )}
    </div>
  );
}
