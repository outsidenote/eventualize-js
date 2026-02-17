import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress';
import EvDbStreamCursor from '@eventualize/types/EvDbStreamCursor';
import EvDbEvent from '@eventualize/types/EvDbEvent';
import { checkAborted } from '../utils/abort.js';
import { DEFAULT_SPARSE_INDEX_INTERVAL } from './constants.js';
import type { EventIndexEntry } from './StepperTypes.js';

export class EventWindowManager {
  private _eventWindow: EvDbEvent[] = [];
  private _windowStartIndex: number = 0;
  private _sparseIndex: EventIndexEntry[] = [];
  private _actualEventCount: number = 0;

  constructor(
    private readonly streamAdapter: IEvDbStorageStreamAdapter,
    private readonly streamAddress: EvDbStreamAddress,
    private readonly windowSize: number
  ) {}

  get actualEventCount(): number {
    return this._actualEventCount;
  }

  get sparseIndex(): EventIndexEntry[] {
    return this._sparseIndex;
  }

  async loadInitialWindow(startOffset: number, signal?: AbortSignal): Promise<void> {
    checkAborted(signal);

    const cursor = new EvDbStreamCursor(this.streamAddress, startOffset);

    this._eventWindow = [];
    this._sparseIndex = [];
    this._windowStartIndex = 0;
    let seq = 0;

    for await (const event of this.streamAdapter.getEventsAsync(cursor)) {
      checkAborted(signal);

      if (seq % DEFAULT_SPARSE_INDEX_INTERVAL === 0) {
        this._sparseIndex.push({
          seq,
          offset: event.streamCursor.offset,
          timestamp: event.capturedAt
        });
      }

      if (seq < this.windowSize) {
        this._eventWindow.push(event);
      }

      seq++;
    }

    this._actualEventCount = seq;
  }

  async loadWindowFromIndex(startIndex: number, signal?: AbortSignal): Promise<boolean> {
    if (startIndex < 0) startIndex = 0;

    if (startIndex >= this._actualEventCount) {
      this._eventWindow = [];
      return false;
    }

    const nearestSparse = this.getNearestSparseEntry(startIndex);
    if (nearestSparse === null) {
      this._eventWindow = [];
      return false;
    }

    checkAborted(signal);

    const cursor = new EvDbStreamCursor(this.streamAddress, nearestSparse.offset);

    this._eventWindow = [];

    let currentSeq = nearestSparse.seq;
    let firstPushedSeq: number | null = null;
    let pushed = 0;

    for await (const event of this.streamAdapter.getEventsAsync(cursor)) {
      checkAborted(signal);

      if (currentSeq >= startIndex) {
        if (firstPushedSeq === null) firstPushedSeq = currentSeq;

        this._eventWindow.push(event);
        pushed++;
        if (pushed >= this.windowSize) break;
      }

      currentSeq++;
    }

    if (firstPushedSeq === null) {
      this._eventWindow = [];
      this._windowStartIndex = startIndex;
      return false;
    }

    this._windowStartIndex = firstPushedSeq;
    return true;
  }

  ensureEventInWindow(index: number, signal?: AbortSignal): Promise<boolean> | void {
    if (this.isIndexInWindow(index)) return;

    const windowStart = Math.max(0, index - Math.floor(this.windowSize / 4));
    return this.loadWindowFromIndex(windowStart, signal);
  }

  getEventAtIndex(index: number): EvDbEvent | null {
    if (index < 0 || index >= this._actualEventCount) {
      return null;
    }

    if (!this.isIndexInWindow(index)) {
      return null;
    }

    const windowIndex = index - this._windowStartIndex;
    return this._eventWindow[windowIndex] ?? null;
  }

  isIndexInWindow(index: number): boolean {
    if (index < 0 || this._eventWindow.length === 0) {
      return false;
    }

    const windowEnd = this._windowStartIndex + this._eventWindow.length;
    return index >= this._windowStartIndex && index < windowEnd;
  }

  getNearestSparseEntry(targetIndex: number): EventIndexEntry | null {
    const a = this._sparseIndex;
    if (a.length === 0) return null;

    let left = 0;
    let right = a.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = (left + right) >> 1;
      if (a[mid].seq <= targetIndex) {
        result = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return result >= 0 ? a[result] : null;
  }
}
