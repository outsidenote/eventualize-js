import EvDbEvent from '@eventualize/types/EvDbEvent';

export type ReplayTarget =
  | { offset: number }
  | { timestamp: Date };

export interface ReplayOptions {
  signal?: AbortSignal;
}

export interface StepResult<TState> {
  state: TState;
  event: EvDbEvent | null;
  offset: number;
  timestamp: Date | null;
  isAtEnd: boolean;
}

export interface TimeTravelerStepper<TState> {
  next(count?: number, options?: ReplayOptions): Promise<StepResult<TState>>;
  goto(target: ReplayTarget, options?: ReplayOptions): Promise<StepResult<TState>>;
  reset(): void;
  readonly position: { offset: number; timestamp: Date | null };
  readonly state: TState;
  readonly isAtEnd: boolean;
}

export interface StepperOptions {
  checkpointInterval?: number;
  useSnapshot?: boolean;
  windowSize?: number;
  maxCheckpoints?: number;
}

export interface StateDiff<TState> {
  from: { offset: number; state: TState };
  to: { offset: number; state: TState };
  changedKeys: string[];
}

export interface DiffOptions {
  deepCompare?: boolean;
  equals?: (a: unknown, b: unknown) => boolean;
}

export interface IReplayEngine<TState> {
  replayTo(target: ReplayTarget, options?: ReplayOptions): Promise<TState>;
  replayToOffset(offset: number, options?: ReplayOptions): Promise<TState>;
  replayToTimestamp(timestamp: Date, options?: ReplayOptions): Promise<TState>;
  getLatestState(options?: ReplayOptions): Promise<TState>;
  replay(target: ReplayTarget, options?: ReplayOptions): AsyncGenerator<StepResult<TState>>;
  getEventsInRange(fromOffset: number, toOffset: number, options?: ReplayOptions): Promise<EvDbEvent[]>;
}

export interface IDiffCalculator<TState> {
  diff(from: ReplayTarget, to: ReplayTarget, options?: DiffOptions): Promise<StateDiff<TState>>;
}

export interface IStepperFactory<TState> {
  createStepper(options?: StepperOptions): TimeTravelerStepper<TState>;
}
