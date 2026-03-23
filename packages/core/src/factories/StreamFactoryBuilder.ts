import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import { EvDbStreamFactory } from "./EvDbStreamFactory.js";
import type { StreamWithEventMethods } from "./EvDbStreamFactory.js";
import type { EventTypeConfig } from "./EvDbStreamFactoryTypes.js"; // used by withEvent
import type { ViewFactory, EvDbStreamEventHandlersMap } from "./EvDbViewFactory.js";
import { createViewFactory } from "./EvDbViewFactory.js";
import type { EvDbView } from "../view/EvDbView.js";

/**
 * Intermediate step returned by `withEvent("name")`.
 * Call `.asType<EventType>()` to provide the event's TypeScript type.
 */
export class EventTypeStep<
  TStreamType extends string,
  TEvents extends { eventType: string },
  TViews extends Record<string, EvDbView<unknown>>,
  TName extends string,
> {
  constructor(private builder: StreamFactoryBuilder<TStreamType, TEvents, TViews>) { }

  asType<TEvent extends object>(): StreamFactoryBuilder<TStreamType, TEvents | (TEvent & { readonly eventType: TName }), TViews> & { withMessages(producer: EVDbMessagesProducer): StreamFactoryBuilder<TStreamType, TEvents | (TEvent & { readonly eventType: TName }), TViews> } {
    type ResultBuilder = StreamFactoryBuilder<TStreamType, TEvents | (TEvent & { readonly eventType: TName }), TViews>;
    const b = this.builder as unknown as ResultBuilder;
    const lastIndex = (b as any).eventTypes.length - 1;
    (b as any).withMessages = (producer: EVDbMessagesProducer): ResultBuilder => {
      (b as any).eventTypes[lastIndex].eventMessagesProducer = producer;
      return b;
    };
    return b as ResultBuilder & { withMessages(producer: EVDbMessagesProducer): ResultBuilder };
  }
}

/**
 * Fluent builder for creating stream factories with inferred event types
 */
export class StreamFactoryBuilder<
  TStreamType extends string,
  TEvents extends { eventType: string } = never,
  TViews extends Record<string, EvDbView<unknown>> = {},
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
  ): EventTypeStep<TStreamType, TEvents, TViews, TName> {
    this.eventTypes.push({
      eventName: eventType,
    } as EventTypeConfig);
    return new EventTypeStep<TStreamType, TEvents, TViews, typeof eventType>(this as any);
  }

  /**
   * Add a view with inline handler definition
   * This can only be called AFTER withEvent calls to ensure type safety
   */
  public withView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handlers: Partial<EvDbStreamEventHandlersMap<TState, TEvents>>,
  ): StreamFactoryBuilder<TStreamType, TEvents, TViews & Record<TViewName, EvDbView<TState>>> {
    // Create the view factory
    const viewFactory = createViewFactory<TState, TEvents>({
      viewName,
      streamType: this.streamType,
      defaultState,
      handlers,
    });

    this.viewFactories.push(viewFactory);
    this.viewNames.push(viewName);
    return this as any;
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
