import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { replay } from "./api/client";
import type { ReplayBatch, ReplayItem } from "./api/types";
import { directionOf } from "./replay/describeMove";
import type { Move, MoveReason } from "./replay/describeMove";
import { centeredStart, fetchRange } from "./replay/matchNav";
import type { CacheWindow } from "./replayWindow";
import { clampTarget, planMove } from "./replayWindow";

export const MOVE_LOG_SIZE = 12;

export type ReplayCursor = {
  readonly target: number;
  readonly item: ReplayItem | null;
  /** The item right before the target (offset − 1), when it is in the cached batch. */
  readonly previous: ReplayItem | null;
  readonly cacheWindow: CacheWindow | null;
  readonly fetchCount: number;
  readonly loading: boolean;
  readonly error: string | null;
  readonly lastMove: Move | null;
  readonly moves: readonly Move[];
  readonly goTo: (target: number) => void;
  readonly goToCentered: (offset: number) => void;
};

/**
 * Navigation over replay batches of `pageSize` items. Moves inside the cached batch need no
 * request; moves outside it fetch a new batch (see planMove). Every completed move is
 * recorded with its source; a response dropped by the stale guard records nothing.
 */
export function useReplayCursor(
  accountId: string | null,
  lastOffset: number,
  snapshots: boolean,
  pageSize: number,
): ReplayCursor {
  const [batch, setBatch] = useState<ReplayBatch | null>(null);
  const [target, setTarget] = useState(0);
  const [fetchCount, setFetchCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moves, setMoves] = useState<readonly Move[]>([]);
  const requestId = useRef(0);
  const targetRef = useRef(0);
  const prevPageSize = useRef(pageSize);

  // Defensive: never expose a batch that belongs to another account.
  const current = batch !== null && batch.streamId === accountId ? batch : null;

  const cacheWindow = useMemo<CacheWindow | null>(() => {
    const first = current?.items[0];
    const last = current?.items[current.items.length - 1];
    if (first === undefined || last === undefined) return null;
    return { start: first.offset, end: last.offset };
  }, [current]);

  const record = useCallback((m: Move) => {
    setMoves((prev) => [m, ...prev].slice(0, MOVE_LOG_SIZE));
  }, []);

  // Invalidate any in-flight request so its response is dropped.
  const cancelPending = useCallback(() => {
    requestId.current++;
    setLoading(false);
  }, []);

  const moveTo = useCallback((to: number) => {
    targetRef.current = to;
    setTarget(to);
  }, []);

  const load = useCallback(
    async (to: number, fetchOffset: number, reason: MoveReason) => {
      if (accountId === null) return;
      const id = ++requestId.current;
      const from = targetRef.current;
      setLoading(true);
      setError(null);
      try {
        // One extra item before the page gives the ▲/▼ deltas their previous value.
        // For a centred fetch this shifts the page by one item, so the match stays at the
        // same absolute position and is still centred within one item.
        const { start, size } = fetchRange(fetchOffset, pageSize);
        const next = await replay(accountId, start, size, snapshots);
        if (id !== requestId.current) return; // a newer request won: record nothing
        setBatch(next);
        setFetchCount((c) => c + 1);
        moveTo(to);
        const first = next.items[0];
        const last = next.items[next.items.length - 1];
        record({
          target: to,
          direction: directionOf(from, to),
          source: "server",
          reason,
          pageSize,
          ...(first !== undefined && last !== undefined
            ? { fetched: { start: first.offset, end: last.offset } }
            : {}),
        });
      } catch (e) {
        if (id === requestId.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [accountId, snapshots, pageSize, moveTo, record],
  );

  // Account, snapshot mode, page size or head offset changed: drop the cache and reload.
  useEffect(() => {
    cancelPending();
    setBatch(null);
    const reason: MoveReason = prevPageSize.current !== pageSize ? "pageSize" : "reload";
    prevPageSize.current = pageSize;
    if (accountId === null || lastOffset < 0) return;
    const to = clampTarget(targetRef.current, lastOffset);
    void load(to, to, reason);
  }, [accountId, snapshots, lastOffset, pageSize, load, cancelPending]);

  const goTo = useCallback(
    (to: number) => {
      if (lastOffset < 0) return;
      const plan = planMove(to, cacheWindow, lastOffset, pageSize);
      if (plan.kind === "cached") {
        cancelPending(); // the newest intent wins over any pending fetch
        if (plan.target === targetRef.current) return; // clamped or same-offset: no move
        record({
          target: plan.target,
          direction: directionOf(targetRef.current, plan.target),
          source: "cache",
          reason: "nav",
          pageSize,
        });
        moveTo(plan.target);
      } else void load(plan.target, plan.fetchOffset, "nav");
    },
    [cacheWindow, lastOffset, pageSize, load, moveTo, cancelPending, record],
  );

  /** Always fetches a page with `offset` in the middle (used for detection matches). */
  const goToCentered = useCallback(
    (offset: number) => {
      if (lastOffset < 0) return;
      const to = clampTarget(offset, lastOffset);
      void load(to, centeredStart(to, pageSize, lastOffset), "match");
    },
    [lastOffset, pageSize, load],
  );

  const item = current?.items.find((i) => i.offset === target) ?? null;
  const previous = current?.items.find((i) => i.offset === target - 1) ?? null;
  return {
    target,
    item,
    previous,
    cacheWindow,
    fetchCount,
    loading,
    error,
    lastMove: moves[0] ?? null,
    moves,
    goTo,
    goToCentered,
  };
}
