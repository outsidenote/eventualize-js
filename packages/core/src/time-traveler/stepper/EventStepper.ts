import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';
import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress';
import EvDbViewAddress from '@eventualize/types/EvDbViewAddress';
import EvDbEvent from '@eventualize/types/EvDbEvent';
import IEvDbEventPayload from '@eventualize/types/IEvDbEventPayload';
import { ViewFactory, ApplyFn } from '../../EvDbViewFactory.js';
import type { ReplayTarget, ReplayOptions, StepResult, StepperOptions, TimeTravelerStepper } from '../types.js';
import { checkAborted } from '../utils/abort.js';
import { DEFAULT_WINDOW_SIZE, DEFAULT_MAX_CHECKPOINTS } from './constants.js';
import { CheckpointManager } from './CheckpointManager.js';
import { EventWindowManager } from './EventWindowManager.js';
import { IndexSearcher } from './IndexSearcher.js';

export class EventStepper<TState, TEvents extends IEvDbEventPayload> implements TimeTravelerStepper<TState> {
  private _currentIndex: number = -1;
  private _state: TState;
  private _initializationPromise: Promise<void> | null = null;
  private _isAtEnd: boolean = false;

  private readonly _applyFn: ApplyFn<TState, TEvents>;
  private readonly _useSnapshot: boolean;
  private readonly _checkpointManager: CheckpointManager<TState>;
  private readonly _windowManager: EventWindowManager;
  private readonly _indexSearcher: IndexSearcher;

  constructor(
    private readonly streamAdapter: IEvDbStorageStreamAdapter,
    private readonly snapshotAdapter: IEvDbStorageSnapshotAdapter,
    private readonly viewFactory: ViewFactory<TState, TEvents>,
    private readonly streamAddress: EvDbStreamAddress,
    private readonly viewAddress: EvDbViewAddress,
    options?: StepperOptions
  ) {
    this._state = viewFactory.initialState();
    this._applyFn = viewFactory.reducer;
    this._useSnapshot = options?.useSnapshot ?? false;

    const windowSize = options?.windowSize ?? DEFAULT_WINDOW_SIZE;

    this._checkpointManager = new CheckpointManager<TState>(
      {
        checkpointInterval: options?.checkpointInterval ?? 100,
        maxCheckpoints: options?.maxCheckpoints ?? DEFAULT_MAX_CHECKPOINTS
      },
      (state) => viewFactory.cloneState(state),
      viewFactory.initialState()
    );

    this._windowManager = new EventWindowManager(
      streamAdapter,
      streamAddress,
      windowSize
    );

    this._indexSearcher = new IndexSearcher(this._windowManager);
  }

  get position(): { offset: number; timestamp: Date | null } {
    if (this._currentIndex < 0) {
      return { offset: -1, timestamp: null };
    }
    const event = this._windowManager.getEventAtIndex(this._currentIndex);
    if (!event) {
      return { offset: -1, timestamp: null };
    }
    return {
      offset: event.streamCursor.offset,
      timestamp: event.capturedAt
    };
  }

  get state(): TState {
    return this._state;
  }

  get isAtEnd(): boolean {
    return this._isAtEnd;
  }

  async next(count: number = 1, options?: ReplayOptions): Promise<StepResult<TState>> {
    if (count < 0) count = 0;

    const signal = options?.signal;
    checkAborted(signal);

    await this.ensureInitialized(signal);

    let lastEvent: EvDbEvent | null = null;

    for (let i = 0; i < count; i++) {
      checkAborted(signal);

      if (this._currentIndex >= this._windowManager.actualEventCount - 1) {
        this._isAtEnd = true;
        break;
      }

      this._currentIndex++;
      if (!this._windowManager.isIndexInWindow(this._currentIndex)) {
        await this._windowManager.ensureEventInWindow(this._currentIndex, signal);
      }

      const event = this._windowManager.getEventAtIndex(this._currentIndex);
      if (event) {
        lastEvent = event;
        this._state = this._applyFn(this._state, event.payload as TEvents, event);
        this._checkpointManager.createCheckpointIfDue(this._currentIndex, this._state);
      } else {
        this._isAtEnd = true;
        break;
      }
    }

    this._isAtEnd = this._currentIndex >= this._windowManager.actualEventCount - 1;

    return {
      state: this._state,
      event: lastEvent,
      offset: this.position.offset,
      timestamp: this.position.timestamp,
      isAtEnd: this._isAtEnd
    };
  }

  async goto(target: ReplayTarget, options?: ReplayOptions): Promise<StepResult<TState>> {
    const signal = options?.signal;
    checkAborted(signal);

    await this.ensureInitialized(signal);

    const targetIndex = await this._indexSearcher.findTargetIndex(target, signal);

    if (targetIndex < 0) {
      this.restoreToInitialState();
      return {
        state: this._state,
        event: null,
        offset: -1,
        timestamp: null,
        isAtEnd: this._windowManager.actualEventCount === 0
      };
    }

    if (targetIndex > this._currentIndex) {
      await this.moveForward(targetIndex, signal);
    } else if (targetIndex < this._currentIndex) {
      await this.moveBackward(targetIndex, signal);
    }

    this._isAtEnd = this._currentIndex >= this._windowManager.actualEventCount - 1;
    const currentEvent = this._windowManager.getEventAtIndex(this._currentIndex);

    return {
      state: this._state,
      event: currentEvent,
      offset: this.position.offset,
      timestamp: this.position.timestamp,
      isAtEnd: this._isAtEnd
    };
  }

  reset(): void {
    this.restoreToInitialState();
    this._checkpointManager.reset();
  }

  private restoreToInitialState(): void {
    const initial = this._checkpointManager.initialCheckpoint;
    this._state = this.viewFactory.cloneState(initial.state);
    this._currentIndex = initial.index;
    this._isAtEnd = this._windowManager.actualEventCount === 0;
  }

  private async ensureInitialized(signal?: AbortSignal): Promise<void> {
    if (this._initializationPromise) {
      await this._initializationPromise;
      return;
    }

    this._initializationPromise = this.initialize(signal).catch((err) => {
      this._initializationPromise = null;
      throw err;
    });
    await this._initializationPromise;
  }

  private async initialize(signal?: AbortSignal): Promise<void> {
    checkAborted(signal);

    let startOffset = 0;

    if (this._useSnapshot) {
      const snapshot = await this.snapshotAdapter.getSnapshotAsync(this.viewAddress);

      if (snapshot.offset >= 0 && 'state' in snapshot && snapshot.state !== undefined) {
        this._state = this.viewFactory.cloneState(snapshot.state as TState);
        startOffset = snapshot.offset + 1;

        this._checkpointManager.setInitialCheckpoint(snapshot.state as TState, -1);
      }
    }

    await this._windowManager.loadInitialWindow(startOffset, signal);
    this._isAtEnd = this._windowManager.actualEventCount === 0;
  }

  private async moveForward(targetIndex: number, signal?: AbortSignal): Promise<void> {
    for (let i = this._currentIndex + 1; i <= targetIndex; i++) {
      checkAborted(signal);
      if (!this._windowManager.isIndexInWindow(i)) {
        await this._windowManager.ensureEventInWindow(i, signal);
      }

      const event = this._windowManager.getEventAtIndex(i);
      if (event) {
        this._state = this._applyFn(this._state, event.payload as TEvents, event);
        this._currentIndex = i;
        this._checkpointManager.createCheckpointIfDue(this._currentIndex, this._state);
      } else {
        this._isAtEnd = true;
        break;
      }
    }
  }

  private async moveBackward(targetIndex: number, signal?: AbortSignal): Promise<void> {
    const restored = this._checkpointManager.restoreFromNearestCheckpoint(targetIndex);
    this._state = restored.state;
    this._currentIndex = restored.index;

    for (let i = this._currentIndex + 1; i <= targetIndex; i++) {
      checkAborted(signal);
      if (!this._windowManager.isIndexInWindow(i)) {
        await this._windowManager.ensureEventInWindow(i, signal);
      }

      const event = this._windowManager.getEventAtIndex(i);
      if (event) {
        this._state = this._applyFn(this._state, event.payload as TEvents, event);
        this._currentIndex = i;
      } else {
        this._isAtEnd = true;
        break;
      }
    }
  }
}
