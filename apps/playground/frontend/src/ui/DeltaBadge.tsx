import { formatAmount } from "../format";
import { deltaOf } from "./delta";

/** ▲/▼ change versus the previous offset; renders nothing when there is no change or no previous. */
export function Delta({
  current,
  previous,
}: {
  readonly current: number;
  readonly previous: number | null;
}) {
  const d = deltaOf(current, previous);
  if (d.sign === 0) return null;
  const amount = formatAmount(d.abs, "");
  return (
    <span
      className={d.sign > 0 ? "delta up" : "delta down"}
      aria-label={d.sign > 0 ? `increased by ${amount}` : `decreased by ${amount}`}
    >
      {d.sign > 0 ? "▲" : "▼"}
      {amount}
    </span>
  );
}
