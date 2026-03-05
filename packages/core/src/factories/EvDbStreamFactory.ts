import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";

import EvDbStream from "../store/EvDbStream.js";
import type { EvDbView } from "../view/EvDbView.js";
import type { EvDbStreamFactoryConfig } from "./EvDbStreamFactoryTypes.js";
import type { IEvDbStreamFactory } from "./IEvDbStreamFactory.js";

/**
 * Dynamic append methods: `appendEvent${EventName}(payload) => Promise<void>`.
 * Typed via template literal index signature — all registered event names are valid,
 * but payload types are not narrowed per-event (use `appendEvent(name, payload)` for
 * fully-typed calls, or the dynamic methods for ergonomic chaining).
 */
type AppendEventMethods = {
  readonly [K: `appendEvent${string}`]: (event: object) => Promise<void>;
};

/**
 * Type helper to create view accessors map.
 */
type ViewAccessors<TViews extends Record<string, EvDbView<unknown>>> = {
  readonly views: TViews;
};

/**
 * Combined stream type with dynamic append methods and view accessors.
 * TViews maps view names to EvDbView instances.
 */
export type StreamWithEventMethods<TViews extends Record<string, EvDbView<unknown>> = {}> =
  EvDbStream & AppendEventMethods & ViewAccessors<TViews>;

/**
 * Stream Factory - creates stream instances with configured views and dynamic event methods.
 */
export class EvDbStreamFactory<
  TEvents extends { readonly eventType: string },
  TStreamType extends string,
  TViews extends Record<string, EvDbView<unknown>> = {},
> implements IEvDbStreamFactory<TStreamType, TViews>
{
  private DynamicStreamClass: new (
    streamType: string,
    views: EvDbView<unknown>[],
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    streamId: string,
    lastStreamOffset: number,
  ) => StreamWithEventMethods<TViews>;

  constructor(private readonly config: EvDbStreamFactoryConfig<TEvents, TStreamType>) {
    this.DynamicStreamClass = this.createDynamicStreamClass();
  }

  /**
   * Creates a dynamic stream class with event-specific methods and view accessors.
   */
  private createDynamicStreamClass() {
    const eventTypes = this.config.eventTypes;
    const viewNames = this.config.viewNames;

    const messagesProducer: EVDbMessagesProducer = (
      event: EvDbEvent,
      viewsState: Readonly<Record<string, unknown>>,
    ) => {
      const eventType = eventTypes.find((e) => e.eventName === event.eventType);
      if (!eventType || !eventType.eventMessagesProducers.length) return [];
      return eventType.eventMessagesProducers.flatMap((producer) => producer(event, viewsState));
    };

    class DynamicStream extends EvDbStream {
      public readonly views: Record<string, EvDbView<unknown>> = {};

      constructor(
        streamType: string,
        views: EvDbView<unknown>[],
        streamStorageAdapter: IEvDbStorageStreamAdapter,
        streamId: string,
        lastStreamOffset: number,
      ) {
        super(
          streamType,
          views,
          streamStorageAdapter,
          streamId,
          lastStreamOffset,
          messagesProducer,
        );

        // Create view accessors
        views.forEach((view, index) => {
          const viewName = viewNames[index];
          if (viewName) {
            this.views[viewName] = view;
          }
        });
      }
    }

    // Add dynamic methods for each event type
    eventTypes.forEach(({ eventName }) => {
      const methodName = `appendEvent${eventName}`;
      (DynamicStream.prototype as unknown as Record<string, unknown>)[methodName] = function (
        this: EvDbStream,
        event: object,
      ) {
        return this.appendEvent(eventName, event);
      };
    });

    return DynamicStream as unknown as new (
      streamType: string,
      views: EvDbView<unknown>[],
      streamStorageAdapter: IEvDbStorageStreamAdapter,
      streamId: string,
      lastStreamOffset: number,
    ) => StreamWithEventMethods<TViews>;
  }

  /**
   * Creates a stream instance with all configured views and dynamic event methods.
   */
  public create(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter | undefined = undefined,
    lastStreamOffset: number = 0,
  ): StreamWithEventMethods<TViews> {
    const views = snapshotStorageAdapter
      ? this.createViews(streamId, snapshotStorageAdapter)
      : ([] as EvDbView<never>[]);

    return new this.DynamicStreamClass(
      this.config.streamType,
      views,
      streamStorageAdapter,
      streamId,
      lastStreamOffset,
    );
  }

  private createViews(
    streamId: string,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter,
  ): Array<EvDbView<unknown>> {
    const views = this.config.viewFactories.map((factory) =>
      factory.create(streamId, snapshotStorageAdapter),
    );
    return views;
  }

  private getViews(
    streamId: string,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter,
  ): Promise<EvDbView<unknown>>[] {
    const getViewPromises = this.config.viewFactories.map((viewFactory) =>
      viewFactory.get(streamId, snapshotStorageAdapter),
    );
    return getViewPromises;
  }

  /**
   * Fetches from storage a stream instance with all configured views and dynamic event methods.
   */
  public async get(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter | undefined = undefined,
  ): Promise<StreamWithEventMethods<TViews>> {
    const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);

    const views = snapshotStorageAdapter
      ? await Promise.all(this.getViews(streamId, snapshotStorageAdapter))
      : [];

    if (!views.length) {
      const lastStreamOffset = await streamStorageAdapter.getLastOffsetAsync(streamAddress);
      const stream = this.create(
        streamId,
        streamStorageAdapter,
        snapshotStorageAdapter,
        lastStreamOffset,
      );
      return stream;
    }

    const lowestViewOffset = views.reduce(
      (lowestOffset: number, currentView: EvDbView<unknown>) =>
        Math.min(lowestOffset, currentView.storeOffset),
      Number.MAX_VALUE,
    );

    let streamOffset: number = -1;
    if (snapshotStorageAdapter) {
      const streamCursor = new EvDbStreamCursor(streamAddress, lowestViewOffset + 1);
      const events = await streamStorageAdapter.getEventsAsync(streamCursor);

      streamOffset = lowestViewOffset;
      for await (const event of events) {
        views.forEach((view) => view.applyEvent(event));
        streamOffset = event.streamCursor.offset;
      }
    } else {
      streamOffset = // TODO: get last offset from stream storage adapter if no snapshot adapter is provided
        streamOffset = await streamStorageAdapter.getLastOffsetAsync(streamAddress);
    }

    return new this.DynamicStreamClass(
      this.config.streamType,
      views,
      streamStorageAdapter,
      streamId,
      streamOffset,
    );
  }

  public getStreamType(): TStreamType {
    return this.config.streamType;
  }
}

/**
 * Factory function to create a StreamFactory.
 */
export function createEvDbStreamFactory<
  TEvents extends { readonly eventType: string },
  TStreamType extends string,
  TViews extends Record<string, EvDbView<unknown>> = {},
>(config: EvDbStreamFactoryConfig<TEvents, TStreamType>): IEvDbStreamFactory<TStreamType, TViews> {
  return new EvDbStreamFactory(config);
}

export type { EvDbStreamFactoryConfig, EventTypeConfig } from "./EvDbStreamFactoryTypes.js";
