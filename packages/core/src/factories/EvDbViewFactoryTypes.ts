import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";

/**
 * Handler function type for applying an event to state
 */
export type EvDbViewEventHandler<TState, TEvent extends { payloadType: string }> = (
  oldState: TState,
  event: TEvent,
  metadata: IEvDbEventMetadata,
) => TState;

/**
 * Map of event handlers - one handler per event type in the union
 * Key is the payloadType string, value is the handler function
 */
export type EvDbStreamEventHandlersMap<TState, TEvents extends { payloadType: string }> = {
  [K in TEvents["payloadType"]]: EvDbViewEventHandler<TState, Extract<TEvents, { payloadType: K }>>;
};

/**
 * Configuration for creating a view
 */
export interface ViewConfig<TState, TEvents extends { payloadType: string }> {
  viewName: string;
  streamType: string;
  defaultState: TState;
  handlers: Partial<EvDbStreamEventHandlersMap<TState, TEvents>>;
}
