// // ============================================================================
// // Core Factory Types
// // ============================================================================

// import EvDbStream from '@eventualize/entities-types/EvDbStream';
// import { EvDbView } from '@eventualize/entities-types/EvDbView';
// import IEvDbStorageSnapshotAdapter from '@eventualize/entities-types/IEvDbStorageSnapshotAdapter';
// import IEvDbStorageStreamAdapter from '@eventualize/entities-types/IEvDbStorageStreamAdapter';
// import IEvDbEventPayload from "@eventualize/entities-types/IEvDbEventPayload";
// import EvDbStreamAddress from '@eventualize/entities-types/EvDbStreamAddress';
// import EvDbViewAddress from '@eventualize/entities-types/EvDbViewAddress';
// import { EvDbStoredSnapshotResult } from '@eventualize/entities-types/EvDbStoredSnapshotResult';

// /**
//  * View factory function type
//  */
// type ViewFactory<TState> = (
//     streamId: string,
//     snapshotAdapter: IEvDbStorageSnapshotAdapter
// ) => EvDbView<TState>;

// /**
//  * Stream configuration
//  */
// interface StreamConfig<TEvents extends IEvDbEventPayload = IEvDbEventPayload> {
//     streamType: string;
//     views: ViewFactory<any>[];
// }

// /**
//  * Base class for stream builders
//  */
// abstract class StreamBuilder<TEvents extends IEvDbEventPayload = IEvDbEventPayload> {
//     protected config: StreamConfig<TEvents>;

//     constructor(streamType: string) {
//         this.config = {
//             streamType,
//             views: []
//         };
//     }

//     /**
//      * Creates a stream instance
//      */
//     public create(
//         streamId: string,
//         streamAdapter: IEvDbStorageStreamAdapter,
//         snapshotAdapter: IEvDbStorageSnapshotAdapter
//     ): EvDbStream {
//         const views = this.config.views.map(factory => factory(streamId, snapshotAdapter));

//         return new EvDbStream(
//             this.config.streamType,
//             views,
//             streamAdapter,
//             streamId,
//             0
//         );
//     }

//     /**
//      * Registers a view with the stream
//      */
//     protected registerView<TState>(factory: ViewFactory<TState>): this {
//         this.config.views.push(factory);
//         return this;
//     }
// }

// // ============================================================================
// // View Builder Pattern
// // ============================================================================

// /**
//  * Helper to create view factories with less boilerplate
//  */
// abstract class ViewBuilder<TState, TEvents extends IEvDbEventPayload = IEvDbEventPayload> {
//     constructor(
//         protected readonly viewName: string,
//         protected readonly streamType: string
//     ) { }

//     /**
//      * Creates the view factory function
//      */
//     public build(): ViewFactory<TState> {
//         return (streamId: string, storageAdapter: IEvDbStorageSnapshotAdapter) => {
//             const streamAddress = new EvDbStreamAddress(this.streamType, streamId);
//             const viewAddress = new EvDbViewAddress(streamAddress, this.viewName);

//             return this.createView(
//                 viewAddress,
//                 storageAdapter,
//                 streamId
//             );
//         };
//     }

//     /**
//      * Override this to create your specific view instance
//      */
//     protected abstract createView(
//         viewAddress: EvDbViewAddress,
//         storageAdapter: IEvDbStorageSnapshotAdapter,
//         streamId: string
//     ): EvDbView<TState>;

//     /**
//      * Override this to provide the default state
//      */
//     protected abstract getDefaultState(): TState;
// }

// // ============================================================================
// // EXAMPLE USAGE: Points Stream
// // ============================================================================

// // Step 1: Define Events (same as before)
// export class PointsAdded implements IEvDbEventPayload {
//     readonly payloadType = 'PointsAdded';
//     constructor(public readonly points: number) { }
// }

// export class PointsSubtracted implements IEvDbEventPayload {
//     readonly payloadType = 'PointsSubtracted';
//     constructor(public readonly points: number) { }
// }

// export type PointsStreamEvents = PointsAdded | PointsSubtracted;

// // Step 2: Define View States
// export class SumViewState {
//     constructor(public sum: number = 0) { }
// }

// export class CountViewState {
//     constructor(public count: number = 0) { }
// }

// // Step 3: Create View Classes (simplified)
// import IEvDbViewAppliesSet from '@eventualize/entities-types/IEvDbViewAppliesSet';
// import IEvDbEventMetadata from '@eventualize/entities-types/IEvDbEventMetadata';

// class SumView extends EvDbView<SumViewState>
//     implements IEvDbViewAppliesSet<SumViewState, PointsStreamEvents> {

//     applyPointsAdded(oldState: SumViewState, newEvent: PointsAdded) {
//         return new SumViewState(oldState.sum + newEvent.points);
//     }

//     applyPointsSubtracted(oldState: SumViewState, newEvent: PointsSubtracted) {
//         return new SumViewState(oldState.sum - newEvent.points);
//     }

//     public getDefaultState(): SumViewState {
//         return new SumViewState();
//     }
// }

// class CountView extends EvDbView<CountViewState>
//     implements IEvDbViewAppliesSet<CountViewState, PointsStreamEvents> {

//     applyPointsAdded(oldState: CountViewState, newEvent: PointsAdded) {
//         return new CountViewState(oldState.count + 1);
//     }

//     applyPointsSubtracted(oldState: CountViewState, newEvent: PointsSubtracted) {
//         return new CountViewState(oldState.count + 1);
//     }

//     public getDefaultState(): CountViewState {
//         return new CountViewState();
//     }
// }

// // Step 4: Create View Builders
// class SumViewBuilder extends ViewBuilder<SumViewState, PointsStreamEvents> {
//     constructor(streamType: string) {
//         super('SumView', streamType);
//     }

//     protected createView(
//         viewAddress: EvDbViewAddress,
//         storageAdapter: IEvDbStorageSnapshotAdapter,
//         streamId: string
//     ): EvDbView<SumViewState> {
//         return new SumView(
//             viewAddress,
//             undefined,
//             0,
//             0,
//             storageAdapter,
//             EvDbStoredSnapshotResult.getEmptyState<SumViewState>()
//         );
//     }

//     protected getDefaultState(): SumViewState {
//         return new SumViewState();
//     }
// }

// class CountViewBuilder extends ViewBuilder<CountViewState, PointsStreamEvents> {
//     constructor(streamType: string) {
//         super('CountView', streamType);
//     }

//     protected createView(
//         viewAddress: EvDbViewAddress,
//         storageAdapter: IEvDbStorageSnapshotAdapter,
//         streamId: string
//     ): EvDbView<CountViewState> {
//         return new CountView(
//             viewAddress,
//             undefined,
//             0,
//             0,
//             storageAdapter,
//             EvDbStoredSnapshotResult.getEmptyState<CountViewState>()
//         );
//     }

//     protected getDefaultState(): CountViewState {
//         return new CountViewState();
//     }
// }

// // Step 5: Create the Stream Builder (SIMPLIFIED!)
// class PointsStreamBuilder extends StreamBuilder<PointsStreamEvents> {
//     constructor() {
//         super('PointsStream');

//         // Register views in constructor
//         this.registerView(new SumViewBuilder(this.config.streamType).build());
//         this.registerView(new CountViewBuilder(this.config.streamType).build());
//     }
// }

// // Step 6: Export singleton instance
// export const PointsStream = new PointsStreamBuilder();

// // ============================================================================
// // USAGE EXAMPLES
// // ============================================================================

// /*
// // Creating a stream is now super simple:
// const stream = PointsStream.create(
//   'user-123',
//   streamStorageAdapter,
//   snapshotStorageAdapter
// );

// // That's it! All views are automatically created and configured.
// */

// // ============================================================================
// // ALTERNATIVE: Even More Simplified API
// // ============================================================================

// /**
//  * Fluent API for building streams
//  */
// class FluentStreamBuilder<TEvents extends IEvDbEventPayload = IEvDbEventPayload>
//     extends StreamBuilder<TEvents> {

//     /**
//      * Add a view using a class constructor
//      */
//     public withView<TState>(
//         viewName: string,
//         ViewClass: new (
//             viewAddress: EvDbViewAddress,
//             storedAt: Date | undefined,
//             storeOffset: number,
//             memoryOffset: number,
//             storageAdapter: IEvDbStorageSnapshotAdapter,
//             snapshot: EvDbStoredSnapshotResult<TState>
//         ) => EvDbView<TState>
//     ): this {
//         const factory: ViewFactory<TState> = (streamId, storageAdapter) => {
//             const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);
//             const viewAddress = new EvDbViewAddress(streamAddress, viewName);

//             return new ViewClass(
//                 viewAddress,
//                 undefined,
//                 0,
//                 0,
//                 storageAdapter,
//                 EvDbStoredSnapshotResult.getEmptyState<TState>()
//             );
//         };

//         this.registerView(factory);
//         return this;
//     }
// }

// // Even simpler usage:
// export const PointsStreamFluent = new FluentStreamBuilder<PointsStreamEvents>('PointsStream')
//     .withView('SumView', SumView)
//     .withView('CountView', CountView);

// /*
// // Usage is identical:
// const stream = PointsStreamFluent.create(
//   'user-123',
//   streamStorageAdapter,
//   snapshotStorageAdapter
// );
// */