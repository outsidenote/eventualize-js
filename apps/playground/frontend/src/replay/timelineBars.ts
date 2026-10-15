import type { CacheWindow } from "../replayWindow";

export type BarKind = "deposit" | "withdraw" | "denied";

export function barKind(eventType: string): BarKind {
  if (eventType === "FundsDeposited") return "deposit";
  if (eventType === "FundsWithdrawn") return "withdraw";
  return "denied";
}

/** Bar height in percent: 15 at value ≤ 1, +17 per decade, capped at 100. */
export function barHeight(value: number): number {
  const decades = Math.log10(Math.max(1, value));
  return Math.min(100, Math.round(15 + decades * 17));
}

export function inWindow(offset: number, w: CacheWindow | null): boolean {
  return w !== null && offset >= w.start && offset <= w.end;
}
