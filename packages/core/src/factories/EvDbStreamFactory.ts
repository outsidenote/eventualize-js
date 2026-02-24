import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";

import EvDbStream from "../store/EvDbStream.js";
import type { EvDbView } from "../view/EvDbView.js";
import type { EvDbStreamFactoryConfig } from "./EvDbStreamFactoryTypes.js";

/**
 * Type helper to extract event methods
 */
type EventMethods<TEvents extends IEvDbEventPayload> = {
  [K in TEvents as `appendEvent${K["payloadType"]}`]: (event: Omit<K, "payloadType">) => Promise<void>;
};

/**
 * Type helper to create view accessors map
 */
type ViewAccessors<TViews extends Record<string, EvDbView<any>>> = {
  readonly views: TViews;
};

/**
 * Combined stream type with event methods and view accessors
 */
export type StreamWithEventMethods<
  TEvents extends IEvDbEventPayload,
  TViews extends Record<string, EvDbView<any>> = {},
> = EvDbStream & EventMethods<TEvents> & ViewAccessors<TViews>;

/**
 * Stream Factory - creates stream instances with configured views and dynamic event methods
 */
export class EvDbStreamFactory<
  TEvents extends IEvDbEventPayload,
  TStreamType extends string,
  TViews extends Record<string, EvDbView<any>> = {},
> {
  private DynamicStreamClass: new (
    streamType: string,
    views: EvDbView<any>[],
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    streamId: string,
    lastStreamOffset: number,
  ) => StreamWithEventMethods<TEvents, TViews>;

  constructor(private readonly config: EvDbStreamFactoryConfig<TEvents, TStreamType>) {
    this.DynamicStreamClass = this.createDynamicStreamClass();
  }

  /**
   * Creates a dynamic stream class with event-specific methods and view accessors
   */
  private createDynamicStreamClass() {
    const eventTypes = this.config.eventTypes;
    const viewNames = this.config.viewNames;

    const messagesProducer: EVDbMessagesProducer = (
      event: EvDbEvent,
      viewsState: Readonly<Record<string, unknown>>,
    ) => {
      const eventType = eventTypes.find((e) => e.eventName === event.eventType);
      if (!eventType || !eventType.eventMessagesProducer) return [];
      return eventType.eventMessagesProducer(event, viewsState);
    };

    class DynamicStream extends EvDbStream {
      public readonly views: Record<string, EvDbView<any>> = {};

      constructor(
        streamType: string,
        views: EvDbView<any>[],
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
    eventTypes.forEach(({ eventName, eventClass: _eventClass }) => {
      const methodName = `appendEvent${eventName}`;
      (DynamicStream.prototype as any)[methodName] = async function (
        event: Omit<InstanceType<typeof _eventClass>, "payloadType">,
      ) {
        return this.appendEvent({ ...event, payloadType: eventName });
      };
    });

  return DynamicStream as any;
  }

  /**
   * Creates a stream instance with all configured views and dynamic event methods
   */
  public create(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter | undefined = undefined,
    lastStreamOffset: number = 0,
  ): StreamWithEventMethods<TEvents, TViews> {
    const views = snapshotStorageAdapter
                    ? this.createViews(streamId, snapshotStorageAdapter)
                    : [] as EvDbView<never>[];

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
  ): Array<EvDbView<any>> {
    const views = this.config.viewFactories.map((factory) =>
      factory.create(streamId, snapshotStorageAdapter),
    );
    return views;
  }

  private getViews(
    streamId: string,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter,
  ): Promise<EvDbView<any>>[] {
    const getViewPromises = this.config.viewFactories.map((viewFactory) =>
      viewFactory.get(streamId, snapshotStorageAdapter),
    );
    return getViewPromises;
  }

  /**
   * Fetches from storage a stream instance with all configured views and dynamic event methods
   */
  public async get(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter | undefined = undefined,
  ): Promise<StreamWithEventMethods<TEvents, TViews>> {
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
      (lowestOffset: number, currentView: EvDbView<any>) =>
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
 * Factory function to create a StreamFactory
 */
export function createEvDbStreamFactory<
  TEvents extends IEvDbEventPayload,
  TStreamType extends string,
  TViews extends Record<string, EvDbView<any>> = {},
>(
  config: EvDbStreamFactoryConfig<TEvents, TStreamType>,
): EvDbStreamFactory<TEvents, TStreamType, TViews> {
  return new EvDbStreamFactory(config);
}

export type { EvDbStreamFactoryConfig, EventTypeConfig } from "./EvDbStreamFactoryTypes.js";
