import type { EvDbSnapshotStrategy } from "../view/EvDbSnapshotStrategyBuilder.js";
import type { DeepReadonly } from "@eventualize/types/view/DeepReadonly";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";

/**
 * Handler function type for applying an event to state
 */
export type EvDbViewEventHandler<TState, TEvent> = (
  oldState: DeepReadonly<TState>,
  event: Readonly<TEvent>,
  metadata: IEvDbEventMetadata,
) => DeepReadonly<TState>;

/**
 * Map of event handlers keyed by event name from TEventMap
 */
export type EvDbStreamEventHandlersMap<TState, TEventMap extends Record<string, object>> = {
  [K in keyof TEventMap]: EvDbViewEventHandler<TState, TEventMap[K]>;
};

/**
 * Configuration for creating a view
 */
export interface ViewConfig<TState, TEventMap extends Record<string, object>> {
  viewName: string;
  streamType: string;
  defaultState: TState;
  handlers: Partial<EvDbStreamEventHandlersMap<TState, TEventMap>>;
  /** When set, decides when the view stores a snapshot. Default: every store call writes. */
  snapshotStrategy?: EvDbSnapshotStrategy<TState>;
}
