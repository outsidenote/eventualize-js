import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";

/**
 * Handler function type for applying an event to state
 */
export type EvDbViewEventHandler<TState, TEvent extends { eventType: string }> = (
  oldState: TState,
  event: TEvent,
  metadata: IEvDbEventMetadata,
) => TState;

/**
 * Map of event handlers - one handler per event type in the union
 * Key is the eventType string, value is the handler function
 */
export type EvDbStreamEventHandlersMap<TState, TEvents extends { eventType: string }> = {
  [K in TEvents["eventType"]]: EvDbViewEventHandler<TState, Extract<TEvents, { eventType: K }>>;
};

/**
 * Configuration for creating a view
 */
export interface ViewConfig<TState, TEvents extends { eventType: string }> {
  viewName: string;
  streamType: string;
  defaultState: TState;
  handlers: Partial<EvDbStreamEventHandlersMap<TState, TEvents>>;
}
