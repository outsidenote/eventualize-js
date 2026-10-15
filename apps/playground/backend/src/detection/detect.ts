import { cents } from "../domain/money.js";

export type DetectorKind =
  "riskJump" | "riskRise" | "riskDecline" | "balanceCrossUp" | "balanceCrossDown";

export type Detector =
  | { readonly kind: "riskJump"; readonly jump: number }
  | { readonly kind: "riskRise"; readonly percent: number; readonly window: number }
  | { readonly kind: "riskDecline"; readonly percent: number; readonly window: number }
  | { readonly kind: "balanceCrossUp"; readonly threshold: number }
  | { readonly kind: "balanceCrossDown"; readonly threshold: number };

export type SeriesPoint = {
  readonly offset: number;
  readonly balance: number;
  readonly risk: number;
};

/** Base used for percent changes so a rise from risk 0 is finite. */
export const RISK_FLOOR = 0.5;

export function isDetectorKind(v: string): v is DetectorKind {
  return (
    v === "riskJump" ||
    v === "riskRise" ||
    v === "riskDecline" ||
    v === "balanceCrossUp" ||
    v === "balanceCrossDown"
  );
}

/** Percent change of risk from `window` points earlier, or null when there is no such point. */
function riskChangePercent(
  points: readonly SeriesPoint[],
  i: number,
  window: number,
): number | null {
  const before = points[i - window];
  const now = points[i];
  if (before === undefined || now === undefined) return null;
  return ((now.risk - before.risk) / Math.max(before.risk, RISK_FLOOR)) * 100;
}

function holds(points: readonly SeriesPoint[], i: number, d: Detector): boolean {
  const now = points[i];
  const prev = points[i - 1];
  if (now === undefined) return false;
  switch (d.kind) {
    case "riskJump":
      return prev !== undefined && Math.abs(now.risk - prev.risk) >= d.jump;
    case "riskRise": {
      const change = riskChangePercent(points, i, d.window);
      return change !== null && change >= d.percent;
    }
    case "riskDecline": {
      const change = riskChangePercent(points, i, d.window);
      return change !== null && -change >= d.percent;
    }
    case "balanceCrossUp":
      return (
        prev !== undefined && cents(prev.balance) < d.threshold && cents(now.balance) >= d.threshold
      );
    case "balanceCrossDown":
      return (
        prev !== undefined && cents(prev.balance) >= d.threshold && cents(now.balance) < d.threshold
      );
  }
}

/**
 * Edge-triggered detection: returns the offset where each run of true conditions
 * starts, in ascending order.
 */
export function detect(points: readonly SeriesPoint[], detector: Detector): number[] {
  const matches: number[] = [];
  let previous = false;
  for (let i = 0; i < points.length; i++) {
    const current = holds(points, i, detector);
    const point = points[i];
    if (current && !previous && point !== undefined) matches.push(point.offset);
    previous = current;
  }
  return matches;
}
