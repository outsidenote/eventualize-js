import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';
import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress';
import EvDbViewAddress from '@eventualize/types/EvDbViewAddress';
import EvDbEvent from '@eventualize/types/EvDbEvent';
import IEvDbEventPayload from '@eventualize/types/IEvDbEventPayload';
import { ViewFactory } from '../../EvDbViewFactory.js';
import type {
  ReplayTarget,
  ReplayOptions,
  StepResult,
  StepperOptions,
  StateDiff,
  DiffOptions,
  TimeTravelerStepper,
  IReplayEngine,
  IDiffCalculator,
  IStepperFactory
} from '../types.js';
import { ReplayEngine } from '../replay/ReplayEngine.js';
import { DiffCalculator } from '../diff/DiffCalculator.js';
import { EventStepper } from '../stepper/EventStepper.js';

export class EvDbTimeTraveler<TState, TEvents extends IEvDbEventPayload = IEvDbEventPayload>
  implements IReplayEngine<TState>, IDiffCalculator<TState>, IStepperFactory<TState> {

  private readonly replayEngine: ReplayEngine<TState, TEvents>;
  private readonly diffCalculator: DiffCalculator<TState>;
  private readonly streamAddress: EvDbStreamAddress;
  private readonly viewAddress: EvDbViewAddress;

  constructor(
    private readonly streamAdapter: IEvDbStorageStreamAdapter,
    private readonly snapshotAdapter: IEvDbStorageSnapshotAdapter,
    private readonly viewFactory: ViewFactory<TState, TEvents>,
    streamId: string
  ) {
    this.streamAddress = new EvDbStreamAddress(
      viewFactory.streamType,
      streamId
    );
    this.viewAddress = new EvDbViewAddress(
      this.streamAddress,
      viewFactory.viewName
    );
    this.replayEngine = new ReplayEngine(
      streamAdapter,
      snapshotAdapter,
      viewFactory,
      this.streamAddress,
      this.viewAddress
    );
    this.diffCalculator = new DiffCalculator(this.replayEngine);
  }

  async replayTo(target: ReplayTarget, options?: ReplayOptions): Promise<TState> {
    return this.replayEngine.replayTo(target, options);
  }

  async *replay(target: ReplayTarget, options?: ReplayOptions): AsyncGenerator<StepResult<TState>> {
    yield* this.replayEngine.replay(target, options);
  }

  async replayToOffset(offset: number, options?: ReplayOptions): Promise<TState> {
    return this.replayEngine.replayToOffset(offset, options);
  }

  async replayToTimestamp(timestamp: Date, options?: ReplayOptions): Promise<TState> {
    return this.replayEngine.replayToTimestamp(timestamp, options);
  }

  async getLatestState(options?: ReplayOptions): Promise<TState> {
    return this.replayEngine.getLatestState(options);
  }

  async getEventsInRange(fromOffset: number, toOffset: number, options?: ReplayOptions): Promise<EvDbEvent[]> {
    return this.replayEngine.getEventsInRange(fromOffset, toOffset, options);
  }

  async diff(from: ReplayTarget, to: ReplayTarget, options?: DiffOptions): Promise<StateDiff<TState>> {
    return this.diffCalculator.diff(from, to, options);
  }

  createStepper(options?: StepperOptions): TimeTravelerStepper<TState> {
    return new EventStepper<TState, TEvents>(
      this.streamAdapter,
      this.snapshotAdapter,
      this.viewFactory,
      this.streamAddress,
      this.viewAddress,
      options
    );
  }
}

export function createTimeTraveler<TState, TEvents extends IEvDbEventPayload>(
  streamAdapter: IEvDbStorageStreamAdapter,
  snapshotAdapter: IEvDbStorageSnapshotAdapter,
  viewFactory: ViewFactory<TState, TEvents>,
  streamId: string
): EvDbTimeTraveler<TState, TEvents> {
  return new EvDbTimeTraveler(
    streamAdapter,
    snapshotAdapter,
    viewFactory,
    streamId
  );
}
