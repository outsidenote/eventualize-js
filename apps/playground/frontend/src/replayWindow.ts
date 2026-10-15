/** Offsets held by the last replay batch, inclusive. */
export type CacheWindow = { readonly start: number; readonly end: number };

export type MovePlan =
  | { readonly kind: "cached"; readonly target: number }
  | { readonly kind: "fetch"; readonly target: number; readonly fetchOffset: number };

export function clampTarget(target: number, lastOffset: number): number {
  return Math.min(Math.max(target, 0), Math.max(lastOffset, 0));
}

/**
 * Decides whether a move can be served from the cached batch.
 * Moving back before the window fetches a batch that ends on the target,
 * so further steps back stay cached (the read-only stream cannot step backward).
 */
export function planMove(
  target: number,
  cacheWindow: CacheWindow | null,
  lastOffset: number,
  batchSize: number,
): MovePlan {
  const t = clampTarget(target, lastOffset);
  if (cacheWindow !== null && t >= cacheWindow.start && t <= cacheWindow.end) {
    return { kind: "cached", target: t };
  }
  if (cacheWindow !== null && t < cacheWindow.start) {
    return { kind: "fetch", target: t, fetchOffset: Math.max(0, t - batchSize + 1) };
  }
  return { kind: "fetch", target: t, fetchOffset: t };
}
