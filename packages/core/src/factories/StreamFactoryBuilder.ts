import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import { EvDbStreamFactory } from "./EvDbStreamFactory.js";
import type { StreamWithEventMethods } from "./EvDbStreamFactory.js";
import type { EventTypeConfig } from "./EvDbStreamFactoryTypes.js";
import type { ViewFactory, EvDbStreamEventHandlersMap } from "./EvDbViewFactory.js";
import { createViewFactory } from "./EvDbViewFactory.js";
import type { EvDbView } from "../view/EvDbView.js";

/**
 * Fluent builder for creating stream factories with inferred event types
 */
export class StreamFactoryBuilder<
  TStreamType extends string,
  TEvents extends IEvDbEventPayload = never,
  TViews extends Record<string, EvDbView<any>> = {},
> {
  private viewFactories: ViewFactory<any, TEvents>[] = [];
  private eventTypes: EventTypeConfig<any>[] = [];
  private viewNames: string[] = [];

  constructor(private streamType: TStreamType) {}

  /**
   * Register event type for dynamic method generation - infers the event name from class name
   */
  withEventType<TEvent extends IEvDbEventPayload>(
    eventClass: new (...args: any[]) => TEvent,
    eventMessagesProducer?: EVDbMessagesProducer,
  ): StreamFactoryBuilder<TStreamType, TEvents | TEvent, TViews> {
    // Use the class name as the event name
    const eventName = eventClass.name;

    this.eventTypes.push({
      eventClass,
      eventName,
      eventMessagesProducer,
    } as EventTypeConfig<TEvent>);
    return this as any;
  }

  /**
   * Add a view with inline handler definition
   * This can only be called AFTER withEventType calls to ensure type safety
   */
  public withView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handlers: EvDbStreamEventHandlersMap<TState, TEvents>,
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
   * Add a pre-created view factory (legacy support)
   */
  public withViewFactory<TViewName extends string, TState>(
    viewName: TViewName,
    viewFactory: ViewFactory<TState, TEvents>,
  ): StreamFactoryBuilder<TStreamType, TEvents, TViews & Record<TViewName, EvDbView<TState>>> {
    this.viewFactories.push(viewFactory);
    this.viewNames.push(viewName);
    return this as any;
  }

  /**
   * Build the stream factory
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
