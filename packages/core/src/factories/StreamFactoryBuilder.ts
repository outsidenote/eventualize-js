import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { EvDbStreamFactory } from "./EvDbStreamFactory.js";
import type { StreamWithEventMethods, TypedViewStates } from "./EvDbStreamFactory.js";
import type { EventTypeConfig } from "./EvDbStreamFactoryTypes.js"; // used by withEvent
import type { ViewFactory, EvDbStreamEventHandlersMap } from "./EvDbViewFactory.js";
import { createViewFactory } from "./EvDbViewFactory.js";
import type { EvDbView } from "../view/EvDbView.js";

/**
 * Maps TEventMap keys to view event handler functions with clean payload types
 */
type EventHandlersFromMap<TState, TEventMap extends Record<string, object>> = {
  [K in keyof TEventMap]: (
    oldState: TState,
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
  TEvents extends { eventType: string },
  TViews extends Record<string, EvDbView<unknown>>,
  TName extends string,
  TEventMap extends Record<string, object> = {},
> {
  constructor(private builder: StreamFactoryBuilder<TStreamType, TEvents, TViews, TEventMap>) { }

  asType<TEvent extends object>(): StreamFactoryBuilder<TStreamType, TEvents | (TEvent & { readonly eventType: TName }), TViews, TEventMap & Record<TName, TEvent>> {
    return this.builder as unknown as StreamFactoryBuilder<TStreamType, TEvents | (TEvent & { readonly eventType: TName }), TViews, TEventMap & Record<TName, TEvent>>;
  }
}

/**
 * Fluent builder for creating stream factories with inferred event types
 */
export class StreamFactoryBuilder<
  TStreamType extends string,
  TEvents extends { eventType: string } = never,
  TViews extends Record<string, EvDbView<unknown>> = {},
  TEventMap extends Record<string, object> = {},
> {
  private viewFactories: ViewFactory<any, TEvents>[] = [];
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
  ): EventTypeStep<TStreamType, TEvents, TViews, TName, TEventMap> {
    this.eventTypes.push({
      eventName: eventType,
    } as EventTypeConfig);
    return new EventTypeStep<TStreamType, TEvents, TViews, typeof eventType, TEventMap>(this as any);
  }

  /**
   * Add a view with inline handler definition
   * This can only be called AFTER withEvent calls to ensure type safety
   */
  public withView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handlers: Partial<EventHandlersFromMap<TState, TEventMap>>,
  ): StreamFactoryBuilder<TStreamType, TEvents, TViews & Record<TViewName, EvDbView<TState>>, TEventMap> {
    // Create the view factory
    const viewFactory = createViewFactory<TState, TEvents>({
      viewName,
      streamType: this.streamType,
      defaultState,
      handlers: handlers as unknown as Partial<EvDbStreamEventHandlersMap<TState, TEvents>>,
    });

    this.viewFactories.push(viewFactory);
    this.viewNames.push(viewName);
    return this as any;
  }

  /**
   * Register a message producer for a specific event type.
   * Should be called after `withView` so that view state types are available.
   */
  public withMessages<TName extends TEvents["eventType"] & keyof TEventMap>(
    eventType: TName,
    producer: (
      payload: Readonly<TEventMap[TName]>,
      views: Readonly<TypedViewStates<TViews>>,
      metadata: IEvDbEventMetadata,
    ) => EvDbMessage[],
  ): this {
    const config = this.eventTypes.find(e => e.eventName === eventType);
    if (config) {
      config.eventMessagesProducer = (event, viewStates) => {
        return producer(
          event.payload as TEventMap[TName],
          viewStates as Readonly<TypedViewStates<TViews>>,
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
    }) as EvDbStreamFactory<TEvents, TStreamType, TViews>;

    // Return factory with type helper for stream type extraction
    return Object.assign(factory, {
      // This is a type-only property for extracting the stream type
      StreamType: null as unknown as StreamWithEventMethods<TEvents, TViews>,
    });
  }
}
