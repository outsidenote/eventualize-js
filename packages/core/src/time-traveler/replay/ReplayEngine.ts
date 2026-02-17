import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';
import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress';
import EvDbStreamCursor from '@eventualize/types/EvDbStreamCursor';
import EvDbViewAddress from '@eventualize/types/EvDbViewAddress';
import EvDbEvent from '@eventualize/types/EvDbEvent';
import { EvDbStoredSnapshotResult } from '@eventualize/types/EvDbStoredSnapshotResult';
import IEvDbEventPayload from '@eventualize/types/IEvDbEventPayload';
import { ViewFactory } from '../../EvDbViewFactory.js';
import type { ReplayTarget, ReplayOptions, StepResult, IReplayEngine } from '../types.js';
import { checkAborted } from '../utils/abort.js';
import { getTargetOffset, getTargetTimestamp } from '../utils/target.js';

export class ReplayEngine<TState, TEvents extends IEvDbEventPayload = IEvDbEventPayload>
  implements IReplayEngine<TState> {

  constructor(
    protected readonly streamAdapter: IEvDbStorageStreamAdapter,
    protected readonly snapshotAdapter: IEvDbStorageSnapshotAdapter,
    protected readonly viewFactory: ViewFactory<TState, TEvents>,
    protected readonly streamAddress: EvDbStreamAddress,
    protected readonly viewAddress: EvDbViewAddress
  ) {}

  async replayTo(target: ReplayTarget, options?: ReplayOptions): Promise<TState> {
    const signal = options?.signal;
    checkAborted(signal);

    const snapshot = await this.snapshotAdapter.getSnapshotAsync(this.viewAddress);
    const startOffset = this.getStartOffset(snapshot, target);
    let state = this.getInitialStateFromSnapshot(snapshot, startOffset, target);

    const applyFn = this.viewFactory.reducer;
    const cursor = new EvDbStreamCursor(this.streamAddress, startOffset);

    for await (const event of this.streamAdapter.getEventsAsync(cursor)) {
      checkAborted(signal);
      if (this.exceedsTarget(event, target)) break;
      state = applyFn(state, event.payload as TEvents, event);
    }

    return state;
  }

  async *replay(target: ReplayTarget, options?: ReplayOptions): AsyncGenerator<StepResult<TState>> {
    const signal = options?.signal;
    checkAborted(signal);

    const snapshot = await this.snapshotAdapter.getSnapshotAsync(this.viewAddress);
    const startOffset = this.getStartOffset(snapshot, target);
    let state = this.getInitialStateFromSnapshot(snapshot, startOffset, target);

    const applyFn = this.viewFactory.reducer;
    const cursor = new EvDbStreamCursor(this.streamAddress, startOffset);
    const lastOffset = await this.streamAdapter.getLastOffsetAsync(this.streamAddress);

    for await (const event of this.streamAdapter.getEventsAsync(cursor)) {
      checkAborted(signal);
      if (this.exceedsTarget(event, target)) break;

      state = applyFn(state, event.payload as TEvents, event);

      const targetOffset = getTargetOffset(target);
      const isAtEnd =
        event.streamCursor.offset >= lastOffset ||
        (targetOffset !== null && event.streamCursor.offset >= targetOffset);

      yield {
        state,
        event,
        offset: event.streamCursor.offset,
        timestamp: event.capturedAt,
        isAtEnd
      };
    }
  }

  async replayToOffset(offset: number, options?: ReplayOptions): Promise<TState> {
    if (offset < 0) {
      return this.viewFactory.initialState();
    }
    return this.replayTo({ offset }, options);
  }

  async replayToTimestamp(timestamp: Date, options?: ReplayOptions): Promise<TState> {
    if (!(timestamp instanceof Date) || isNaN(timestamp.getTime())) {
      throw new Error('Invalid timestamp provided');
    }
    return this.replayTo({ timestamp }, options);
  }

  async getLatestState(options?: ReplayOptions): Promise<TState> {
    const lastOffset = await this.streamAdapter.getLastOffsetAsync(this.streamAddress);
    if (lastOffset < 0) {
      return this.viewFactory.initialState();
    }
    return this.replayTo({ offset: lastOffset }, options);
  }

  async getEventsInRange(fromOffset: number, toOffset: number, options?: ReplayOptions): Promise<EvDbEvent[]> {
    if (fromOffset < 0) fromOffset = 0;
    if (toOffset < fromOffset) {
      return [];
    }

    const signal = options?.signal;
    checkAborted(signal);

    const events: EvDbEvent[] = [];
    const cursor = new EvDbStreamCursor(this.streamAddress, fromOffset);

    for await (const event of this.streamAdapter.getEventsAsync(cursor)) {
      checkAborted(signal);
      if (event.streamCursor.offset > toOffset) break;
      events.push(event);
    }

    return events;
  }

  protected getStartOffset(
    snapshot: EvDbStoredSnapshotResult<TState> | { offset: number },
    target: ReplayTarget
  ): number {
    const snapshotOffset = snapshot.offset ?? -1;
    const targetOffset = getTargetOffset(target);

    if (targetOffset !== null) {
      if (snapshotOffset >= targetOffset) {
        return 0;
      }
      return Math.max(snapshotOffset, -1) + 1;
    }

    const targetTimestamp = getTargetTimestamp(target);
    if (targetTimestamp !== null) {
      const snapshotStoredAt = (snapshot as EvDbStoredSnapshotResult<TState>).storedAt;
      if (snapshotStoredAt && snapshotOffset >= 0 && snapshotStoredAt <= targetTimestamp) {
        return snapshotOffset + 1;
      }
      return 0;
    }

    return Math.max(snapshotOffset, -1) + 1;
  }

  protected shouldUseSnapshotState(
    snapshot: { offset: number; state?: TState },
    startOffset: number,
    target?: ReplayTarget
  ): boolean {
    if (target && 'timestamp' in target) {
      const targetTimestamp = getTargetTimestamp(target);
      const snapshotStoredAt = (snapshot as EvDbStoredSnapshotResult<TState>).storedAt;
      if (!targetTimestamp || !snapshotStoredAt || snapshotStoredAt > targetTimestamp) {
        return false;
      }
    }
    return startOffset > 0 && snapshot.offset >= 0 && 'state' in snapshot && snapshot.state !== undefined;
  }

  protected getInitialStateFromSnapshot(
    snapshot: { offset: number; state?: TState },
    startOffset: number,
    target?: ReplayTarget
  ): TState {
    if (this.shouldUseSnapshotState(snapshot, startOffset, target)) {
      return this.viewFactory.cloneState(snapshot.state as TState);
    }
    return this.viewFactory.initialState();
  }

  protected exceedsTarget(event: EvDbEvent, target: ReplayTarget): boolean {
    const targetOffset = getTargetOffset(target);
    if (targetOffset !== null) {
      return event.streamCursor.offset > targetOffset;
    }
    const targetTimestamp = getTargetTimestamp(target);
    if (targetTimestamp !== null) {
      return event.capturedAt > targetTimestamp;
    }
    return false;
  }
}
