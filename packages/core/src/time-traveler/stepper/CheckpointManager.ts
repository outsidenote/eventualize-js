import type { InitialCheckpoint } from './StepperTypes.js';

export interface CheckpointManagerConfig {
  checkpointInterval: number;
  maxCheckpoints: number;
}

export class CheckpointManager<TState> {
  private _checkpointMap: Map<number, TState> = new Map();
  private _checkpointIndices: number[] = [];
  private _initialCheckpoint: InitialCheckpoint<TState>;

  constructor(
    private readonly config: CheckpointManagerConfig,
    private readonly cloneState: (state: TState) => TState,
    initialState: TState
  ) {
    this._initialCheckpoint = {
      state: cloneState(initialState),
      index: -1
    };
  }

  get initialCheckpoint(): InitialCheckpoint<TState> {
    return this._initialCheckpoint;
  }

  setInitialCheckpoint(state: TState, index: number): void {
    this._initialCheckpoint = {
      state: this.cloneState(state),
      index
    };
    this._checkpointMap.set(index, this.cloneState(state));
    this._checkpointIndices.push(index);
  }

  createCheckpointIfDue(currentIndex: number, currentState: TState): void {
    if (this.config.checkpointInterval <= 0) return;

    const shouldCheckpoint = (currentIndex + 1) % this.config.checkpointInterval === 0;

    if (shouldCheckpoint && !this._checkpointMap.has(currentIndex)) {
      if (this._checkpointIndices.length >= this.config.maxCheckpoints) {
        this.evictOldestCheckpoint();
      }

      this._checkpointMap.set(currentIndex, this.cloneState(currentState));
      this._checkpointIndices.push(currentIndex);
    }
  }

  restoreFromNearestCheckpoint(targetIndex: number): { state: TState; index: number } {
    const checkpointIdx = this.findNearestCheckpointIndex(targetIndex);

    if (checkpointIdx >= 0) {
      const idx = this._checkpointIndices[checkpointIdx];
      const state = this._checkpointMap.get(idx);
      if (state !== undefined) {
        return { state: this.cloneState(state), index: idx };
      }
    }

    return {
      state: this.cloneState(this._initialCheckpoint.state),
      index: this._initialCheckpoint.index
    };
  }

  reset(): void {
    this._checkpointMap.clear();
    this._checkpointIndices = [];

    if (this._initialCheckpoint.index >= 0) {
      this._checkpointMap.set(
        this._initialCheckpoint.index,
        this.cloneState(this._initialCheckpoint.state)
      );
      this._checkpointIndices.push(this._initialCheckpoint.index);
    }
  }

  private evictOldestCheckpoint(): void {
    if (this._checkpointIndices.length <= 1) return;

    const oldestIdx = this._checkpointIndices[0];
    if (oldestIdx === this._initialCheckpoint.index) {
      if (this._checkpointIndices.length > 1) {
        const secondOldest = this._checkpointIndices[1];
        this._checkpointMap.delete(secondOldest);
        this._checkpointIndices.splice(1, 1);
      }
    } else {
      this._checkpointMap.delete(oldestIdx);
      this._checkpointIndices.shift();
    }
  }

  private findNearestCheckpointIndex(targetIndex: number): number {
    const indices = this._checkpointIndices;
    if (indices.length === 0) return -1;

    let left = 0;
    let right = indices.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = (left + right) >> 1;
      if (indices[mid] <= targetIndex) {
        result = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return result;
  }
}
