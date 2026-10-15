export const SPLIT_MIN = 25;
export const SPLIT_MAX = 75;
export const SPLIT_DEFAULT = 40;
export const SPLIT_STEP = 2;
export const SPLIT_STORAGE_KEY = "evdb-playground.split";

/** Left-pane width in percent, clamped to SPLIT_MIN..SPLIT_MAX, one decimal. */
export function clampRatio(r: number): number {
  if (!Number.isFinite(r)) return SPLIT_DEFAULT;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(r * 10) / 10));
}

export function ratioFromPointer(clientX: number, left: number, width: number): number {
  if (width <= 0) return SPLIT_DEFAULT;
  return clampRatio(((clientX - left) / width) * 100);
}

export function parseStoredRatio(raw: string | null): number {
  if (raw === null) return SPLIT_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) ? clampRatio(n) : SPLIT_DEFAULT;
}
