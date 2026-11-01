import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";

export interface EvDbSnapshotContext {
  /** memoryOffset - storeOffset */
  readonly offsetGap: number;
  /** now - storedAt, in milliseconds */
  readonly durationGapMs: number;
}

/**
 * How a view decides that an applied event changed its state.
 * - "always": a handled event always counts as a change. Safe.
 * - "trusted": a handled event counts as a change only when the handler returns a new
 *   reference. A handler that mutates its state in place and returns it is missed, and the
 *   view then stores a pointer over a changed state.
 */
export type EvDbChangeDetection = "always" | "trusted";

/** state is the view state after the event is applied. */
export interface EvDbSnapshotStrategyBuilder<TState, TEventMap extends Record<string, object>> {
  when(predicate: (ctx: EvDbSnapshotContext) => boolean): this;
  /** Any event. event is the union of all payloads. */
  onEvent(
    predicate: (
      state: TState,
      event: TEventMap[keyof TEventMap & string],
      metadata: IEvDbEventMetadata,
    ) => boolean,
  ): this;
  /**
   * One event type. Matches when metadata.eventType === eventType and the
   * predicate (default: always true) returns true.
   */
  onEvent<K extends keyof TEventMap & string>(
    eventType: K,
    predicate?: (
      state: TState,
      event: TEventMap[K],
      metadata: IEvDbEventMetadata & { eventType: K },
    ) => boolean,
  ): this;
  /** Store when offset gap >= events. */
  offsetGap(events: number): this;
  /** Store when duration gap >= ms. */
  durationGapMs(ms: number): this;
  /** Default "always". Not a store rule: it does not change when a snapshot is due. */
  changeDetection(mode: EvDbChangeDetection): this;
}

export interface EvDbSnapshotStrategy<TState> {
  readonly hasRules: boolean;
  readonly changeDetection: EvDbChangeDetection;
  shouldStore(ctx: EvDbSnapshotContext): boolean;
  matchesEvent(state: TState, event: IEvDbPayloadData, metadata: IEvDbEventMetadata): boolean;
}

export type EvDbSnapshotStrategyConfigure<TState, TEventMap extends Record<string, object>> = (
  snapshot: EvDbSnapshotStrategyBuilder<TState, TEventMap>,
) => EvDbSnapshotStrategyBuilder<TState, TEventMap> | void;

function assertNonNegative(name: string, value: number): void {
  if (Number.isNaN(value) || value < 0) {
    throw new RangeError(`${name} must be a number >= 0, got ${value}`);
  }
}

type EventRule<TState> = (
  state: TState,
  event: IEvDbPayloadData,
  metadata: IEvDbEventMetadata,
) => boolean;

class SnapshotStrategyBuilder<
  TState,
  TEventMap extends Record<string, object>,
> implements EvDbSnapshotStrategyBuilder<TState, TEventMap> {
  readonly #contextRules: Array<(ctx: EvDbSnapshotContext) => boolean> = [];
  readonly #eventRules: Array<EventRule<TState>> = [];
  #changeDetection: EvDbChangeDetection = "always";

  get hasRules(): boolean {
    return this.#contextRules.length > 0 || this.#eventRules.length > 0;
  }

  when(predicate: (ctx: EvDbSnapshotContext) => boolean): this {
    this.#contextRules.push(predicate);
    return this;
  }

  onEvent(
    predicate: (
      state: TState,
      event: TEventMap[keyof TEventMap & string],
      metadata: IEvDbEventMetadata,
    ) => boolean,
  ): this;
  onEvent<K extends keyof TEventMap & string>(
    eventType: K,
    predicate?: (
      state: TState,
      event: TEventMap[K],
      metadata: IEvDbEventMetadata & { eventType: K },
    ) => boolean,
  ): this;
  onEvent(
    first: string | ((state: TState, event: never, metadata: never) => boolean),
    predicate?: (state: TState, event: never, metadata: never) => boolean,
  ): this {
    if (typeof first === "function") {
      // Cast: the runtime payload is one of the map's payloads; the wrapper hides the type erasure.
      this.#eventRules.push((state, event, metadata) =>
        first(state, event as never, metadata as never),
      );
    } else {
      this.#eventRules.push((state, event, metadata) => {
        if (metadata.eventType !== first) return false;
        // Cast: eventType matched, so event and metadata have the typed shape.
        return predicate?.(state, event as never, metadata as never) ?? true;
      });
    }
    return this;
  }

  offsetGap(events: number): this {
    assertNonNegative("offsetGap", events);
    return this.when((ctx) => ctx.offsetGap >= events);
  }

  durationGapMs(ms: number): this {
    assertNonNegative("durationGapMs", ms);
    return this.when((ctx) => ctx.durationGapMs >= ms);
  }

  changeDetection(mode: EvDbChangeDetection): this {
    this.#changeDetection = mode;
    return this;
  }

  /**
   * Separate object: the builder method `changeDetection(mode)` and the strategy property
   * `changeDetection` share a name, so one class cannot be both.
   */
  build(): EvDbSnapshotStrategy<TState> {
    const hasRules = this.hasRules;
    const contextRules = [...this.#contextRules];
    const eventRules = [...this.#eventRules];
    return {
      hasRules,
      changeDetection: this.#changeDetection,
      shouldStore: (ctx) => !hasRules || contextRules.some((rule) => rule(ctx)),
      matchesEvent: (state, event, metadata) =>
        eventRules.some((rule) => rule(state, event, metadata)),
    };
  }
}

export function createSnapshotStrategy<TState, TEventMap extends Record<string, object>>(
  configure: EvDbSnapshotStrategyConfigure<TState, TEventMap>,
): EvDbSnapshotStrategy<TState> {
  const builder = new SnapshotStrategyBuilder<TState, TEventMap>();
  configure(builder);
  return builder.build();
}
