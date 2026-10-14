import type { StatsState } from "../api/types";
import { Delta } from "../ui/DeltaBadge";

const TILES: ReadonlyArray<{
  readonly key: keyof StatsState;
  readonly icon: string;
  readonly cls: string;
}> = [
  { key: "deposits", icon: "▲", cls: "tile-deposit" },
  { key: "withdrawals", icon: "▼", cls: "tile-withdraw" },
  { key: "denied", icon: "⛔", cls: "tile-denied" },
];

export function StatsWidget({
  stats,
  previous,
}: {
  readonly stats: StatsState;
  readonly previous: StatsState | null;
}) {
  return (
    <div className="card widget">
      <h3>stats</h3>
      <div className="tiles">
        {TILES.map((t) => (
          <div key={t.key} className={`tile ${t.cls}`}>
            <span className="tile-icon">{t.icon}</span>
            <b>{stats[t.key]}</b>
            <span className="dim small">
              {t.key} <Delta current={stats[t.key]} previous={previous?.[t.key] ?? null} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
