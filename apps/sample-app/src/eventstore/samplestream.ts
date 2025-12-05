import IEvDbEventPayload from '@eventualize/entities-types/IEvDbEventPayload';
import IEvDbEventsSet from '@eventualize/entities-types/IEvDbEventsSet';
import IEvDbEventMetadata from '@eventualize/entities-types/IEvDbEventMetadata';
import EvDbStreamCursor from '@eventualize/entities-types/EvDbStreamCursor';
import { EvDbView } from '@eventualize/entities-types/EvDbView';
import IEvDbViewAppliesSet from '@eventualize/entities-types/IEvDbViewAppliesSet';
import EvDbStream from '@eventualize/entities-types/EvDbStream';
import EvDbViewAddress from '@eventualize/entities-types/EvDbViewAddress';
import IEvDbStorageSnapshotAdapter from '@eventualize/entities-types/IEvDbStorageSnapshotAdapter';
import { EvDbStoredSnapshotResult } from '@eventualize/entities-types/EvDbStoredSnapshotResult';
import StorageAdapterStub from './StorageAdapterStub.js';
import EvDbStreamAddress from '@eventualize/entities-types/EvDbStreamAddress';


class Event1 implements IEvDbEventPayload {
    readonly payloadType = 'Event1';
    constructor(public readonly value1: number) { }
}

class Event2 implements IEvDbEventPayload {
    readonly payloadType = 'Event2';
    constructor(public readonly value2: number) { }
}

class State1 {
    constructor(public sum: number = 0) { };
}

type ExampleStreamEvents = Event1 | Event2;

class View1 extends EvDbView<State1> implements IEvDbViewAppliesSet<State1, ExampleStreamEvents> {
    applyEvent1(oldState: State1, newEvent: Event1, eventMetadata: IEvDbEventMetadata) { return new State1(oldState.sum + newEvent.value1) };
    applyEvent2(oldState: State1, newEvent: Event2, eventMetadata: IEvDbEventMetadata) { return new State1(oldState.sum + newEvent.value2) };
    public getDefaultState(): State1 {
        return new State1();
    }

    constructor(
        streamId: string,
        storageAdapter: IEvDbStorageSnapshotAdapter,
        snapshot: EvDbStoredSnapshotResult<State1>,
        storedAt: Date | undefined = undefined,
        storeOffset: number = 0,
        memoryOffset: number = 0,
    ) {
        const streamAddress = new EvDbStreamAddress('ExampleStream', streamId);
        const viewAddress = new EvDbViewAddress(streamAddress, 'View1');
        super(viewAddress, storedAt, storeOffset, memoryOffset, storageAdapter, snapshot);
    };
}

const storageAdapterStub = new StorageAdapterStub();

const stream1 = new EvDbStream(
    'ExampleStream',
    [new View1('stream1', storageAdapterStub, EvDbStoredSnapshotResult.getEmptyState<State1>())],
    storageAdapterStub,
    'exampleStream1',
    0
);

console.log(stream1.getViews());
const event1 = new Event1(10);
const event2 = new Event2(20);

stream1.appendEvent(event1, 'tester');
stream1.appendEvent(event2, 'tester');

console.log(stream1.getEvents());
console.log(stream1.getViews());





// Usage
class ExampleEventsSet implements IEvDbEventsSet<Event1 | Event2> {
    async applyEvent1(event: Event1): Promise<IEvDbEventMetadata> {
        console.log('Handling Event1:', event.value1);
        return {
            eventType: event.payloadType,
            streamCursor: new EvDbStreamCursor('exampleStream', 'streamId', 0),
            capturedAt: new Date(),
            capturedBy: 'user123',
        }
    }

    async applyEvent2(event: Event2): Promise<IEvDbEventMetadata> {
        console.log('Handling Event2:', event.value2);
        return {
            eventType: event.payloadType,
            streamCursor: new EvDbStreamCursor('exampleStream', 'streamId', 1),
            capturedAt: new Date(),
            capturedBy: 'user123',
        }
    }
}