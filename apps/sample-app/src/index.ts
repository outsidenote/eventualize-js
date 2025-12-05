import EvDbStream from "@eventualize/entities-types/EvDbStream";
import { EvDbStoredSnapshotResult } from "@eventualize/entities-types/EvDbStoredSnapshotResult";

import StorageAdapterStub from "./eventstore/StorageAdapterStub.js";
import { View1, State1, Event1, Event2 } from "./eventstore/samplestream.js";


const storageAdapterStub = new StorageAdapterStub();

const stream1 = new EvDbStream(
    'ExampleStream',
    [new View1('stream1', storageAdapterStub, EvDbStoredSnapshotResult.getEmptyState<State1>())],
    storageAdapterStub,
    'exampleStream1',
    0
);

console.log('Intial Views:\n=========\n', stream1.getViews());
const event1 = new Event1(10);
const event2 = new Event2(20);

stream1.appendEvent(event1, 'tester');
stream1.appendEvent(event2, 'tester');

console.log('Pending Events:\n=========\n', stream1.getEvents());
console.log('Views Current State:\n=========\n',stream1.getViews());
