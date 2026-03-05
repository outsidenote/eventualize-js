import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import { EvDbStreamFactory } from "./EvDbStreamFactory.js";
import type { StreamWithEventMethods } from "./EvDbStreamFactory.js";
import type { EventTypeConfig } from "./EvDbStreamFactoryTypes.js";
import type { ViewFactory, EvDbStreamEventHandlersMap } from "./EvDbViewFactory.js";
import { createViewFactory } from "./EvDbViewFactory.js";
import type { EvDbView } from "../view/EvDbView.js";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/** Maps view names to their state types (not view objects). */
type TypedViewStates<TViews extends Record<string, EvDbView<unknown>>> = {
  [K in keyof TViews]: TViews[K] extends EvDbView<infer S> ? S : never;
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Fluent builder for creating stream factories with inferred event types.
 *
 * TStreamType — string literal type of the stream name
 * TEvents     — union of registered event shapes for view handlers and factory internals
 * TViews      — record of registered view name → EvDbView instances
 */
export class StreamFactoryBuilder<
  TStreamType extends string,
  TEvents extends { readonly eventType: string } = never,
  TViews extends Record<string, EvDbView<unknown>> = {},
> {
  private viewFactories: ViewFactory<unknown, TEvents>[] = [];
  private eventTypes: EventTypeConfig[] = [];
  private viewNames: string[] = [];

  constructor(private streamType: TStreamType) { }

  /**
   * Register a POCO event type by explicit name.
   * Callers supply one explicit type arg: `withEvent<MyPayload>("MyEventName")`.
   */
  withEvent<T extends object>(
    eventType: string,
  ): StreamFactoryBuilder<TStreamType, TEvents | (T & { readonly eventType: string }), TViews> {
    this.eventTypes.push({ eventName: eventType, eventMessagesProducers: [] });
    return this as unknown as StreamFactoryBuilder<
      TStreamType,
      TEvents | (T & { readonly eventType: string }),
      TViews
    >;
  }

  /**
   * Add a view with inline handler definition.
   * Must be called after all withEvent calls to ensure type safety.
   */
  public withView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handlers: EvDbStreamEventHandlersMap<TState, TEvents>,
  ): StreamFactoryBuilder<TStreamType, TEvents, TViews & Record<TViewName, EvDbView<TState>>> {
    const viewFactory = createViewFactory<TState, TEvents>({
      viewName,
      streamType: this.streamType,
      defaultState,
      handlers,
    });

    this.viewFactories.push(viewFactory as unknown as ViewFactory<unknown, TEvents>);
    this.viewNames.push(viewName);
    return this as unknown as StreamFactoryBuilder<
      TStreamType,
      TEvents,
      TViews & Record<TViewName, EvDbView<TState>>
    >;
  }

  /**
   * Add a pre-created view factory (legacy support).
   */
  public withViewFactory<TViewName extends string, TState>(
    viewName: TViewName,
    viewFactory: ViewFactory<TState, TEvents>,
  ): StreamFactoryBuilder<TStreamType, TEvents, TViews & Record<TViewName, EvDbView<TState>>> {
    this.viewFactories.push(viewFactory as unknown as ViewFactory<unknown, TEvents>);
    this.viewNames.push(viewName);
    return this as unknown as StreamFactoryBuilder<
      TStreamType,
      TEvents,
      TViews & Record<TViewName, EvDbView<TState>>
    >;
  }

  /**
   * Register a typed outbox message factory for a specific event type.
   *
   * T is the event payload type (one explicit type arg).
   * The factory receives fully-typed event payload and view states; returning undefined
   * suppresses message emission. Multiple calls for the same eventType all fire independently.
   *
   * Must be called after withView so TViews is fully populated.
   */
  public withMessageFactory<T extends object>(
    messageType: string,
    eventType: string,
    factory: (
      event: EvDbEvent & { readonly payload: T },
      views: TypedViewStates<TViews>,
    ) => unknown,
  ): this {
    const producer: EVDbMessagesProducer = (event, viewStates) => {
      if (event.eventType !== eventType) return [];
      const payload = factory(
        event as EvDbEvent & { readonly payload: T },
        viewStates as unknown as TypedViewStates<TViews>,
      );
      if (payload === undefined) return [];
      return [EvDbMessage.createFromEvent(event, messageType, payload)];
    };

    const config = this.eventTypes.find((e) => e.eventName === eventType);
    if (config) {
      config.eventMessagesProducers.push(producer);
    } else {
      this.eventTypes.push({ eventName: eventType, eventMessagesProducers: [producer] });
    }

    return this;
  }

  /**
   * Build the stream factory.
   * The returned factory's `StreamType` property is a type helper for extracting the stream type,
   * which includes dynamic `appendEvent${EventName}` methods and typed view accessors.
   */
  public build(): EvDbStreamFactory<TEvents, TStreamType, TViews> & {
    StreamType: StreamWithEventMethods<TViews>;
  } {
    const factory = new EvDbStreamFactory({
      streamType: this.streamType,
      viewFactories: this.viewFactories,
      eventTypes: this.eventTypes,
      viewNames: this.viewNames,
    }) as EvDbStreamFactory<TEvents, TStreamType, TViews>;

    return Object.assign(factory, {
      StreamType: null as unknown as StreamWithEventMethods<TViews>,
    });
  }
}

// Re-export StreamWithEventMethods for consumers
export type { StreamWithEventMethods } from "./EvDbStreamFactory.js";
