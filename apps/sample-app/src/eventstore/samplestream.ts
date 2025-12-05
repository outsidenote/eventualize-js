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


export class Event1 implements IEvDbEventPayload {
    readonly payloadType = 'Event1';
    constructor(public readonly value1: number) { }
}

export class Event2 implements IEvDbEventPayload {
    readonly payloadType = 'Event2';
    constructor(public readonly value2: number) { }
}

export class State1 {
    constructor(public sum: number = 0) { };
    Empty() {
        return new State1(0);
    }
}

type ExampleStreamEvents = Event1 | Event2;

export class View1 extends EvDbView<State1> implements IEvDbViewAppliesSet<State1, ExampleStreamEvents> {
    applyEvent1(oldState: State1, newEvent: Event1, eventMetadata: IEvDbEventMetadata) {
        const newState =  new State1(oldState.sum + newEvent.value1);
        return newState;
    };
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