export const MAX_PAGE_SIZE = 200;

/** First offset of a page of `pageSize` that has `offset` in the middle, kept inside the stream. */
export function centeredStart(offset: number, pageSize: number, lastOffset: number): number {
  const ideal = offset - Math.floor(pageSize / 2);
  return Math.min(Math.max(ideal, 0), Math.max(0, lastOffset - pageSize + 1));
}

export function stepMatch(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index + delta));
}

/** Request range for a page at `fetchOffset`: one extra leading item (for ▲/▼ deltas) unless the page is already at the maximum. */
export function fetchRange(
  fetchOffset: number,
  pageSize: number,
): { readonly start: number; readonly size: number } {
  if (fetchOffset > 0 && pageSize < MAX_PAGE_SIZE) {
    return { start: fetchOffset - 1, size: pageSize + 1 };
  }
  return { start: fetchOffset, size: pageSize };
}
