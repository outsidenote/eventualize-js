import type { ReplayTarget } from '../types.js';
import { checkAborted } from '../utils/abort.js';
import { getTargetOffset, getTargetTimestamp } from '../utils/target.js';
import type { EventWindowManager } from './EventWindowManager.js';
import type { EventIndexEntry } from './StepperTypes.js';

export class IndexSearcher {
  constructor(
    private readonly windowManager: EventWindowManager
  ) {}

  async findTargetIndex(target: ReplayTarget, signal?: AbortSignal): Promise<number> {
    const targetOffset = getTargetOffset(target);
    if (targetOffset !== null) {
      return this.findIndexByOffset(targetOffset, signal);
    }

    const targetTimestamp = getTargetTimestamp(target);
    if (targetTimestamp !== null) {
      return this.findIndexByTimestamp(targetTimestamp, signal);
    }

    return -1;
  }

  async findIndexByOffset(targetOffset: number, signal?: AbortSignal): Promise<number> {
    const sparseIndex = this.windowManager.sparseIndex;
    if (sparseIndex.length === 0) return -1;

    const sparseIdx = this.binarySearchSparseIndexByOffset(sparseIndex, targetOffset);
    if (sparseIdx < 0) return -1;

    const startIndex = sparseIndex[sparseIdx].seq;
    const endIndex =
      sparseIdx + 1 < sparseIndex.length
        ? sparseIndex[sparseIdx + 1].seq
        : this.windowManager.actualEventCount;

    await this.windowManager.ensureEventInWindow(startIndex, signal);

    let result = -1;
    for (let i = startIndex; i < endIndex && i < this.windowManager.actualEventCount; i++) {
      checkAborted(signal);
      await this.windowManager.ensureEventInWindow(i, signal);

      const event = this.windowManager.getEventAtIndex(i);
      if (!event) break;

      if (event.streamCursor.offset <= targetOffset) {
        result = i;
      } else {
        break;
      }
    }

    return result;
  }

  async findIndexByTimestamp(targetTimestamp: Date, signal?: AbortSignal): Promise<number> {
    const sparseIndex = this.windowManager.sparseIndex;
    if (sparseIndex.length === 0) return -1;

    const targetTime = targetTimestamp.getTime();

    const sparseIdx = this.binarySearchSparseIndexByTimestamp(sparseIndex, targetTime);
    if (sparseIdx < 0) return -1;

    const startIndex = sparseIndex[sparseIdx].seq;
    const endIndex =
      sparseIdx + 1 < sparseIndex.length
        ? sparseIndex[sparseIdx + 1].seq
        : this.windowManager.actualEventCount;

    await this.windowManager.ensureEventInWindow(startIndex, signal);

    let result = -1;
    for (let i = startIndex; i < endIndex && i < this.windowManager.actualEventCount; i++) {
      checkAborted(signal);
      await this.windowManager.ensureEventInWindow(i, signal);

      const event = this.windowManager.getEventAtIndex(i);
      if (!event) break;

      const eventTime = event.capturedAt.getTime();
      if (eventTime <= targetTime) {
        result = i;
      } else {
        break;
      }
    }

    return result;
  }

  private binarySearchSparseIndexByOffset(entries: EventIndexEntry[], targetOffset: number): number {
    if (entries.length === 0) return -1;

    let left = 0;
    let right = entries.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = (left + right) >> 1;
      if (entries[mid].offset <= targetOffset) {
        result = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return result;
  }

  private binarySearchSparseIndexByTimestamp(entries: EventIndexEntry[], targetTime: number): number {
    if (entries.length === 0) return -1;

    let left = 0;
    let right = entries.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = (left + right) >> 1;
      if (entries[mid].timestamp.getTime() <= targetTime) {
        result = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return result;
  }
}
