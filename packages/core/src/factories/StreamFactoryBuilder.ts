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

/**
 * The per-event factory methods on MessageFactoryBuilder.
 * Each `with${EventName}` method takes one explicit type arg for the payload type,
 * ensuring event.payload is precisely typed at each call site.
 */
type MessageFactoryMethods<
  TStreamType extends string,
  TEvents extends { readonly eventType: string },
  TViews extends Record<string, EvDbView<unknown>>,
> = {
  readonly [K: `with${string}`]: <T extends object>(
    messageType: string,
    factory: (
      event: EvDbEvent & { readonly payload: T },
      views: TypedViewStates<TViews>,
    ) => unknown,
  ) => FullMessageFactoryBuilder<TStreamType, TEvents, TViews>;
};

/** MessageFactoryBuilder augmented with the per-event typed methods. */
type FullMessageFactoryBuilder<
  TStreamType extends string,
  TEvents extends { readonly eventType: string },
  TViews extends Record<string, EvDbView<unknown>>,
> = MessageFactoryBuilder<TStreamType, TEvents, TViews> &
  MessageFactoryMethods<TStreamType, TEvents, TViews>;

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

  constructor(private streamType: TStreamType) {}

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
   * Seals TEvents + TViews and returns a MessageFactoryBuilder whose instance
   * carries one typed method per registered event: with<EventName><T>(messageType, factory).
   * Each method takes one explicit type arg T for the event payload type.
   *
   * Must be called after all withView() calls so TViews is fully resolved.
   * withMessageFactories() is optional — call build() directly to skip outbox registration.
   */
  public withMessageFactories(): FullMessageFactoryBuilder<TStreamType, TEvents, TViews> {
    const builder = new MessageFactoryBuilder<TStreamType, TEvents, TViews>(
      this.streamType,
      this.viewFactories,
      this.eventTypes,
      this.viewNames,
    );

    // Inject one method per registered event onto this specific instance.
    // Using instance assignment (not prototype mutation) avoids cross-builder
    // interference when multiple stream factories are built in the same process.
    const instance = builder as unknown as Record<string, unknown>;

    for (const { eventName } of this.eventTypes) {
      const capturedName = eventName;
      instance[`with${capturedName}`] = function (
        this: void,
        messageType: string,
        factory: (event: EvDbEvent, viewStates: unknown) => unknown,
      ): FullMessageFactoryBuilder<TStreamType, TEvents, TViews> {
        const producer: EVDbMessagesProducer = (event, viewStates) => {
          if (event.eventType !== capturedName) return [];
          const payload = factory(event, viewStates);
          if (payload === undefined) return [];
          return [EvDbMessage.createFromEvent(event, messageType, payload)];
        };
        const config = builder.eventTypes.find((e) => e.eventName === capturedName);
        if (config) config.eventMessagesProducers.push(producer);
        return builder as unknown as FullMessageFactoryBuilder<TStreamType, TEvents, TViews>;
      };
    }

    return builder as unknown as FullMessageFactoryBuilder<TStreamType, TEvents, TViews>;
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

// ---------------------------------------------------------------------------
// MessageFactoryBuilder
// ---------------------------------------------------------------------------

/**
 * Builder returned by StreamFactoryBuilder.withMessageFactories().
 * Holds shared mutable state from the parent builder and exposes build().
 * Per-event methods (withPointsAdded<T>, etc.) are injected onto each instance
 * by withMessageFactories() at runtime.
 */
class MessageFactoryBuilder<
  TStreamType extends string,
  TEvents extends { readonly eventType: string },
  TViews extends Record<string, EvDbView<unknown>>,
> {
  constructor(
    private readonly streamType: TStreamType,
    private readonly viewFactories: ViewFactory<unknown, TEvents>[],
    readonly eventTypes: EventTypeConfig[],
    private readonly viewNames: string[],
  ) {}

  /**
   * Build the stream factory.
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
