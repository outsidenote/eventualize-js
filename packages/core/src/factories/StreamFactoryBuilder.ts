import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { EvDbStreamFactory } from "./EvDbStreamFactory.js";
import type { StreamWithEventMethods } from "./EvDbStreamFactory.js";
import type { EventTypeConfig } from "./EvDbStreamFactoryTypes.js"; // used by withEvent
import type { ViewFactory, EvDbStreamEventHandlersMap } from "./EvDbViewFactory.js";
import { createViewFactory } from "./EvDbViewFactory.js";

/**
 * Maps TEventMap keys to view event handler functions with clean payload types
 */
type EventHandlersFromMap<TState, TEventMap extends Record<string, object>> = {
  [K in keyof TEventMap]: (
    oldState: Readonly<TState>,
    event: Readonly<TEventMap[K]>,
    metadata: IEvDbEventMetadata,
  ) => TState;
};

/**
 * Intermediate step returned by `withEvent("name")`.
 * Call `.asType<EventType>()` to provide the event's TypeScript type.
 */
export class EventTypeStep<
  TStreamType extends string,
  TViews extends Record<string, unknown>,
  TName extends string,
  TEventMap extends Record<string, object> = {},
> {
  constructor(private builder: StreamFactoryBuilder<TStreamType, TViews, TEventMap>) { }

  asType<TEvent extends object>(): StreamFactoryBuilder<TStreamType, TViews, TEventMap & Record<TName, TEvent>> {
    return this.builder as unknown as StreamFactoryBuilder<TStreamType, TViews, TEventMap & Record<TName, TEvent>>;
  }
}

/**
 * Fluent builder for creating stream factories with inferred event types
 */
export class StreamFactoryBuilder<
  TStreamType extends string,
  TViews extends Record<string, unknown> = {},
  TEventMap extends Record<string, object> = {},
> {
  private viewFactories: ViewFactory<unknown, TEventMap>[] = [];
  private eventTypes: EventTypeConfig[] = [];
  private viewNames: string[] = [];

  constructor(private streamType: TStreamType) { }

  /**
   * Register a plain object event type by name.
   * Returns an intermediate step — call `.asType<EventType>()` to provide the type.
   * Example: `.withEvent("FundsDeposited").asType<FundsDeposited>()`
   */
  withEvent<TName extends string>(
    eventType: TName,
  ): EventTypeStep<TStreamType, TViews, TName, TEventMap> {
    this.eventTypes.push({
      eventName: eventType,
    } as EventTypeConfig);
    return new EventTypeStep<TStreamType, TViews, typeof eventType, TEventMap>(this as unknown as StreamFactoryBuilder<TStreamType, TViews, TEventMap>);
  }

  /**
   * Add a view with inline handler definition
   * This can only be called AFTER withEvent calls to ensure type safety
   */
  public withView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handlers: Partial<EventHandlersFromMap<TState, TEventMap>>,
  ): StreamFactoryBuilder<TStreamType, TViews & Record<TViewName, TState>, TEventMap> {
    // Create the view factory
    const viewFactory = createViewFactory<TState, TEventMap>({
      viewName,
      streamType: this.streamType,
      defaultState,
      handlers: handlers as unknown as Partial<EvDbStreamEventHandlersMap<TState, TEventMap>>,
    });

    this.viewFactories.push(viewFactory as unknown as ViewFactory<unknown, TEventMap>);
    this.viewNames.push(viewName);
    return this as unknown as StreamFactoryBuilder<TStreamType, TViews & Record<TViewName, TState>, TEventMap>;
  }

  /**
   * Register a message producer for a specific event type.
   * Should be called after `withView` so that view state types are available.
   */
  public withMessages<TName extends string & keyof TEventMap>(
    eventType: TName,
    producer: (
      payload: Readonly<TEventMap[TName]>,
      views: Readonly<TViews>,
      metadata: IEvDbEventMetadata,
    ) => EvDbMessage[],
  ): this {
    const config = this.eventTypes.find(e => e.eventName === eventType);
    if (config) {
      config.eventMessagesProducer = (event, viewStates) => {
        return producer(
          event.payload as TEventMap[TName],
          viewStates as Readonly<TViews>,
          event,
        );
      };
    }
    return this;
  }

  /**
   * Build the stream factory using event types registered via `withEvent`.
   */
  public build() {
    const factory = new EvDbStreamFactory({
      streamType: this.streamType,
      viewFactories: this.viewFactories,
      eventTypes: this.eventTypes,
      viewNames: this.viewNames,
    }) as EvDbStreamFactory<TEventMap, TStreamType, TViews>;

    // Return factory with type helper for stream type extraction
    return Object.assign(factory, {
      // This is a type-only property for extracting the stream type
      StreamType: null as unknown as StreamWithEventMethods<TEventMap, TViews>,
    });
  }
}
