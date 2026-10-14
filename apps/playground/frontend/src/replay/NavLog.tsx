import type { Move } from "./describeMove";
import { describeMove } from "./describeMove";

export function NavLog({ moves }: { readonly moves: readonly Move[] }) {
  if (moves.length === 0) return null;
  return (
    <div className="card">
      <h3>navigation log</h3>
      <div className="navlog">
        {moves.map((m, i) => (
          <div key={moves.length - i}>{describeMove(m)}</div>
        ))}
      </div>
    </div>
  );
}
