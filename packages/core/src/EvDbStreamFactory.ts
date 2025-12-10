import EvDbStream from '@eventualize/types/EvDbStream';
import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';
import IEvDbEventPayload from "@eventualize/types/IEvDbEventPayload";
import { ViewFactory } from './ViewFactory.js';
import { EvDbView } from './EvDbView.js';

/**
 * Configuration for creating a stream factory
 */
export interface EvDbStreamFactoryConfig<TEvents extends IEvDbEventPayload, TStreamType extends string> {
  streamType: TStreamType;
  viewFactories: ViewFactory<any, TEvents>[];
}

/**
 * Stream Factory - creates stream instances with configured views
 */
export class EvDbStreamFactory<TEvents extends IEvDbEventPayload, TStreamType extends string> {
  constructor(private readonly config: EvDbStreamFactoryConfig<TEvents, TStreamType>) { }

  /**
   * Creates a stream instance with all configured views
   */
  public create(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter,
    lastStreamOffset: number = 0
  ): EvDbStream {
    // Create all views using their factories
    const views = this.createViews(streamId, snapshotStorageAdapter);

    return new EvDbStream(
      this.config.streamType,
      views,
      streamStorageAdapter,
      streamId,
      lastStreamOffset
    );
  }

  private createViews(streamId: string, snapshotStorageAdapter: IEvDbStorageSnapshotAdapter): Array<EvDbView<any>> {
    const views = this.config.viewFactories.map(factory =>
      factory.create(streamId, snapshotStorageAdapter)
    );
    return views;
  }

  private getViews(streamId: string, snapshotStorageAdapter: IEvDbStorageSnapshotAdapter): Promise<EvDbView<any>>[] {
    const getViewPromises = this.config.viewFactories.map(factory =>
      factory.get(streamId, snapshotStorageAdapter)
    );
    return getViewPromises;
  }

  /**
   * Fetches from storage a stream instance with all configured views
   */
  public async get(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter
  ): Promise<EvDbStream> {

    const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);

    const views = await Promise.all(this.getViews(streamId, snapshotStorageAdapter));

    if (!views.length) {
      const lastStreamOffset = await streamStorageAdapter.getLastOffsetAsync(streamAddress)
      const stream = this.create(streamId, streamStorageAdapter, snapshotStorageAdapter, lastStreamOffset);
      return stream;
    }

    const lowestViewOffset = views.reduce((lowestOffset: number, currentView: EvDbView<any>) =>
      Math.min(lowestOffset, currentView.storeOffset)
      , 0)

    const streamCursor = new EvDbStreamCursor(streamAddress, lowestViewOffset + 1);
    const events = await streamStorageAdapter.getEventsAsync(streamCursor);

    let streamOffset = lowestViewOffset;
    for await (const event of events) {
      views.forEach(view => view.applyEvent(event));
      streamOffset = event.streamCursor.offset;
    }

    return new EvDbStream(
      this.config.streamType,
      views,
      streamStorageAdapter,
      streamId,
      streamOffset
    );
  }

  public getStreamType(): TStreamType {
    return this.config.streamType;
  }
}

/**
 * Factory function to create a StreamFactory
 */
export function createEvDbStreamFactory<TEvents extends IEvDbEventPayload, TStreamType extends string>(
  config: EvDbStreamFactoryConfig<TEvents, TStreamType>
): EvDbStreamFactory<TEvents, TStreamType> {
  return new EvDbStreamFactory(config);
}

/**
 * Fluent builder for creating stream factories
 */
export class StreamFactoryBuilder<TEvents extends IEvDbEventPayload, TStreamType extends string> {
  private streamType: TStreamType;
  private viewFactories: ViewFactory<any, TEvents>[] = [];

  constructor(streamType: TStreamType) {
    this.streamType = streamType;
  }

  /**
   * Add a view factory to the stream
   */
  public withView<TState>(viewFactory: ViewFactory<TState, TEvents>): this {
    this.viewFactories.push(viewFactory);
    return this;
  }

  /**
   * Add multiple view factories at once
   */
  public withViews(...viewFactories: ViewFactory<any, TEvents>[]): this {
    this.viewFactories.push(...viewFactories);
    return this;
  }

  /**
   * Build the stream factory
   */
  public build(): EvDbStreamFactory<TEvents, TStreamType> {
    return new EvDbStreamFactory({
      streamType: this.streamType,
      viewFactories: this.viewFactories
    });
  }
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

import { createViewFactory } from './ViewFactory.js';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress.js';
import EvDbStreamCursor from '@eventualize/types/EvDbStreamCursor.js';

// Step 1: Define Events (same as before)
export class PointsAdded implements IEvDbEventPayload {
  readonly payloadType = 'PointsAdded';
  constructor(public readonly points: number) { }
}

export class PointsSubtracted implements IEvDbEventPayload {
  readonly payloadType = 'PointsSubtracted';
  constructor(public readonly points: number) { }
}

export type PointsStreamEvents = PointsAdded | PointsSubtracted;

// Step 2: Define View States
export class SumViewState {
  constructor(public sum: number = 0) { }
}

export class CountViewState {
  constructor(public count: number = 0) { }
}

// Step 3: Create View Factories
const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
  viewName: 'SumView',
  streamType: 'PointsStream',
  defaultState: new SumViewState(0),
  handlers: {
    PointsAdded: (oldState, event, metadata) => {
      return new SumViewState(oldState.sum + event.points);
    },
    PointsSubtracted: (oldState, event, metadata) => {
      return new SumViewState(oldState.sum - event.points);
    }
  }
});

const countViewFactory = createViewFactory<CountViewState, PointsStreamEvents>({
  viewName: 'CountView',
  streamType: 'PointsStream',
  defaultState: new CountViewState(0),
  handlers: {
    PointsAdded: (oldState, event, metadata) => {
      return new CountViewState(oldState.count + 1);
    },
    PointsSubtracted: (oldState, event, metadata) => {
      return new CountViewState(oldState.count + 1);
    }
  }
});

// // Step 4: Create Stream Factory - THREE WAYS!

// // Way 1: Using createStreamFactory function
// export const pointsStreamFactory1 = createEvDbStreamFactory<PointsStreamEvents, "PointsStream">({
//   streamType: 'PointsStream',
//   viewFactories: [sumViewFactory, countViewFactory]
// });

// // Way 2: Using fluent builder (RECOMMENDED)
// export const pointsStreamFactory2 = new StreamFactoryBuilder<PointsStreamEvents>('PointsStream')
//   .withView(sumViewFactory)
//   .withView(countViewFactory)
//   .build();

// // Way 3: Using fluent builder with multiple views at once
// export const pointsStreamFactory3 = new StreamFactoryBuilder<PointsStreamEvents>('PointsStream')
//   .withViews(sumViewFactory, countViewFactory)
//   .build();

// // ============================================================================
// // USAGE - IT'S THIS SIMPLE NOW!
// // ============================================================================

// /*
// // Create a stream instance:
// const stream = pointsStreamFactory2.create(
//   'user-123',
//   streamStorageAdapter,
//   snapshotStorageAdapter
// );

// // That's it! All views are automatically created and configured.
// */

// // ============================================================================
// // COMPARISON: BEFORE vs AFTER
// // ============================================================================

// /*
// // BEFORE (manual):
// export default class PointsStream {
//   public static createStream(
//     streamId: string,
//     streamStorageAdapter: IEvDbStorageStreamAdapter,
//     snapshotStorageAdapter: IEvDbStorageSnapshotAdapter,
//   ): EvDbStream {
//     const streamType = 'PointsStream';
//     const sumView = sumViewFactory.create(streamId, snapshotStorageAdapter);
//     const countView = countViewFactory.create(streamId, snapshotStorageAdapter);
//     return new EvDbStream(
//       streamType,
//       [sumView, countView],
//       streamStorageAdapter,
//       streamId,
//       0
//     );
//   }
// }

// // Usage:
// const stream = PointsStream.createStream('user-123', streamAdapter, snapshotAdapter);

// // AFTER (factory):
// export const PointsStream = new StreamFactoryBuilder<PointsStreamEvents>('PointsStream')
//   .withViews(sumViewFactory, countViewFactory)
//   .build();

// // Usage (same simplicity):
// const stream = PointsStream.create('user-123', streamAdapter, snapshotAdapter);
// */

// // ============================================================================
// // ADVANCED: ORGANIZING IN SEPARATE FILES
// // ============================================================================

// /*
// // File: pointsStreamEvents.ts
// export class PointsAdded implements IEvDbEventPayload {
//   readonly payloadType = 'PointsAdded';
//   constructor(public readonly points: number) {}
// }

// export class PointsSubtracted implements IEvDbEventPayload {
//   readonly payloadType = 'PointsSubtracted';
//   constructor(public readonly points: number) {}
// }

// export type PointsStreamEvents = PointsAdded | PointsSubtracted;

// // File: sumView.ts
// export const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
//   viewName: 'SumView',
//   streamType: 'PointsStream',
//   defaultState: new SumViewState(0),
//   handlers: {
//     PointsAdded: (oldState, event) => new SumViewState(oldState.sum + event.points),
//     PointsSubtracted: (oldState, event) => new SumViewState(oldState.sum - event.points)
//   }
// });

// // File: countView.ts
// export const countViewFactory = createViewFactory<CountViewState, PointsStreamEvents>({
//   viewName: 'CountView',
//   streamType: 'PointsStream',
//   defaultState: new CountViewState(0),
//   handlers: {
//     PointsAdded: (oldState) => new CountViewState(oldState.count + 1),
//     PointsSubtracted: (oldState) => new CountViewState(oldState.count + 1)
//   }
// });

// // File: pointsStream.ts (THIS IS ALL YOU NEED!)
// import { StreamFactoryBuilder } from '@eventualize/core';
// import { PointsStreamEvents } from './pointsStreamEvents';
// import { sumViewFactory } from './sumView';
// import { countViewFactory } from './countView';

// export const PointsStream = new StreamFactoryBuilder<PointsStreamEvents>('PointsStream')
//   .withViews(sumViewFactory, countViewFactory)
//   .build();

// // Usage anywhere:
// import { PointsStream } from './pointsStream';

// const stream = PointsStream.create('user-123', streamAdapter, snapshotAdapter);
// */