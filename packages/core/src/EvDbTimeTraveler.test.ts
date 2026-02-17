import { test, describe, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { EvDbTimeTraveler, createTimeTraveler } from './time-traveler/index.js';
import { ViewFactory, createViewFactory } from './EvDbViewFactory.js';
import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';
import EvDbViewAddress from '@eventualize/types/EvDbViewAddress';
import { EvDbStoredSnapshotData } from '@eventualize/types/EvDbStoredSnapshotData';
import { EvDbStoredSnapshotResultRaw } from '@eventualize/types/EvDbStoredSnapshotResult';
import EvDbContinuousFetchOptions from '@eventualize/types/EvDbContinuousFetchOptions';
import EvDbEvent from '@eventualize/types/EvDbEvent';
import EvDbMessage from '@eventualize/types/EvDbMessage';
import EvDbMessageFilter from '@eventualize/types/EvDbMessageFilter';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress';
import EvDbStreamCursor from '@eventualize/types/EvDbStreamCursor';
import { EvDbShardName } from '@eventualize/types/primitiveTypes';
import StreamStoreAffected from '@eventualize/types/StreamStoreAffected';
import IEvDbEventPayload from '@eventualize/types/IEvDbEventPayload';

class PointsAdded implements IEvDbEventPayload {
    readonly payloadType = 'PointsAdded' as const;
    constructor(public readonly points: number) { }
}

class PointsSubtracted implements IEvDbEventPayload {
    readonly payloadType = 'PointsSubtracted' as const;
    constructor(public readonly points: number) { }
}

type TestEvents = PointsAdded | PointsSubtracted;

interface SumState {
    sum: number;
}

class InMemoryStorageAdapter implements IEvDbStorageSnapshotAdapter, IEvDbStorageStreamAdapter {
    private events: EvDbEvent[] = [];
    private snapshots: Map<string, EvDbStoredSnapshotResultRaw> = new Map();

    addEvent(event: EvDbEvent): void {
        this.events.push(event);
    }

    addEvents(events: EvDbEvent[]): void {
        this.events.push(...events);
    }

    clearEvents(): void {
        this.events = [];
    }

    setSnapshot(streamType: string, streamId: string, viewName: string, snapshot: EvDbStoredSnapshotResultRaw): void {
        const key = `${streamType}:${streamId}:${viewName}`;
        this.snapshots.set(key, snapshot);
    }

    async close(): Promise<void> { }

    async *getEventsAsync(streamCursor: EvDbStreamCursor): AsyncGenerator<EvDbEvent, void, undefined> {
        for (const event of this.events) {
            if (event.streamCursor.streamType === streamCursor.streamType &&
                event.streamCursor.streamId === streamCursor.streamId &&
                event.streamCursor.offset >= streamCursor.offset) {
                yield event;
            }
        }
    }

    async getLastOffsetAsync(address: EvDbStreamAddress): Promise<number> {
        const streamEvents = this.events.filter(
            e => e.streamCursor.streamType === address.streamType &&
                e.streamCursor.streamId === address.streamId
        );
        if (streamEvents.length === 0) return -1;
        return Math.max(...streamEvents.map(e => e.streamCursor.offset));
    }

    async storeStreamAsync(events: ReadonlyArray<EvDbEvent>, messages: ReadonlyArray<EvDbMessage>): Promise<StreamStoreAffected> {
        this.events.push(...events);
        return new StreamStoreAffected(events.length, new Map());
    }

    async getSnapshotAsync(viewAddress: EvDbViewAddress): Promise<EvDbStoredSnapshotResultRaw> {
        const key = `${viewAddress.streamType}:${viewAddress.streamId}:${viewAddress.viewName}`;
        return this.snapshots.get(key) ?? EvDbStoredSnapshotResultRaw.Empty;
    }

    async storeSnapshotAsync(snapshotData: EvDbStoredSnapshotData): Promise<void> {
        const key = `${snapshotData.streamType}:${snapshotData.streamId}:${snapshotData.viewName}`;
        this.snapshots.set(key, new EvDbStoredSnapshotResultRaw(
            snapshotData.offset,
            snapshotData.storedAt,
            snapshotData.state
        ));
    }

    getFromOutbox(filter: EvDbMessageFilter, options?: EvDbContinuousFetchOptions | null): Promise<AsyncIterable<EvDbMessage>> {
        throw new Error('Method not implemented.');
    }
    getFromOutboxAsync(shard: EvDbShardName, filter: EvDbMessageFilter, options?: EvDbContinuousFetchOptions | null, cancellation?: AbortSignal): AsyncIterable<EvDbMessage> {
        throw new Error('Method not implemented.');
    }
    getRecordsFromOutboxAsync(filter: EvDbMessageFilter, options?: EvDbContinuousFetchOptions | null, cancellation?: AbortSignal): AsyncIterable<EvDbMessage>;
    getRecordsFromOutboxAsync(shard: EvDbShardName, filter: EvDbMessageFilter, options?: EvDbContinuousFetchOptions | null, cancellation?: AbortSignal): AsyncIterable<EvDbMessage>;
    getRecordsFromOutboxAsync(shard: unknown, filter?: unknown, options?: unknown, cancellation?: unknown): AsyncIterable<EvDbMessage> {
        throw new Error('Method not implemented.');
    }
    subscribeToMessageAsync(handler: (message: EvDbMessage) => Promise<void>, filter: EvDbMessageFilter, options?: EvDbContinuousFetchOptions | null): Promise<void>;
    subscribeToMessageAsync(handler: (message: EvDbMessage) => Promise<void>, shard: EvDbShardName, filter: EvDbMessageFilter, options?: EvDbContinuousFetchOptions | null): Promise<void>;
    subscribeToMessageAsync(handler: unknown, shard: unknown, filter?: unknown, options?: unknown): Promise<void> {
        throw new Error('Method not implemented.');
    }
}

function createTestViewFactory(): ViewFactory<SumState, TestEvents> {
    return createViewFactory<SumState, TestEvents>({
        viewName: 'Sum',
        streamType: 'points',
        defaultState: { sum: 0 },
        handlers: {
            PointsAdded: (state, event) => ({ sum: state.sum + event.points }),
            PointsSubtracted: (state, event) => ({ sum: state.sum - event.points })
        }
    });
}

function createTestEvent(type: 'add' | 'subtract', points: number, offset: number, capturedAt?: Date): EvDbEvent {
    const payload = type === 'add' ? new PointsAdded(points) : new PointsSubtracted(points);
    const cursor = new EvDbStreamCursor('points', 'test-stream', offset);
    return new EvDbEvent(
        payload.payloadType,
        cursor,
        payload,
        capturedAt ?? new Date(),
        'test'
    );
}

describe('EvDbTimeTraveler', () => {
    let adapter: InMemoryStorageAdapter;
    let viewFactory: ViewFactory<SumState, TestEvents>;
    let timeTraveler: EvDbTimeTraveler<SumState, TestEvents>;

    beforeEach(() => {
        adapter = new InMemoryStorageAdapter();
        viewFactory = createTestViewFactory();
        timeTraveler = createTimeTraveler(adapter, adapter, viewFactory, 'test-stream');
    });

    test('module can be imported', async () => {
        const module = await import('./time-traveler/index.js');
        assert.ok(module.EvDbTimeTraveler, 'EvDbTimeTraveler should be exported');
        assert.ok(module.createTimeTraveler, 'createTimeTraveler should be exported');
    });

    describe('replayToOffset', () => {
        test('returns default state when no events', async () => {
            const state = await timeTraveler.replayToOffset(10);
            assert.strictEqual(state.sum, 0);
        });

        test('replays single event', async () => {
            adapter.addEvent(createTestEvent('add', 100, 1));

            const state = await timeTraveler.replayToOffset(1);
            assert.strictEqual(state.sum, 100);
        });

        test('replays multiple events to target offset', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2),
                createTestEvent('subtract', 30, 3),
                createTestEvent('add', 20, 4),
                createTestEvent('subtract', 10, 5)
            ]);

            const stateAt3 = await timeTraveler.replayToOffset(3);
            assert.strictEqual(stateAt3.sum, 120);

            const stateAt5 = await timeTraveler.replayToOffset(5);
            assert.strictEqual(stateAt5.sum, 130);
        });

        test('stops at target offset', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 100, 2),
                createTestEvent('add', 100, 3)
            ]);

            const state = await timeTraveler.replayToOffset(2);
            assert.strictEqual(state.sum, 200);
        });
    });

    describe('replayToTimestamp', () => {
        test('replays events up to timestamp', async () => {
            const time1 = new Date('2024-01-01T10:00:00Z');
            const time2 = new Date('2024-01-01T11:00:00Z');
            const time3 = new Date('2024-01-01T12:00:00Z');

            adapter.addEvents([
                createTestEvent('add', 100, 1, time1),
                createTestEvent('add', 50, 2, time2),
                createTestEvent('add', 25, 3, time3)
            ]);

            const state = await timeTraveler.replayToTimestamp(new Date('2024-01-01T11:30:00Z'));
            assert.strictEqual(state.sum, 150);
        });
    });

    describe('getLatestState', () => {
        test('returns default state when no events', async () => {
            const state = await timeTraveler.getLatestState();
            assert.strictEqual(state.sum, 0);
        });

        test('returns state after all events', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('subtract', 30, 2),
                createTestEvent('add', 50, 3)
            ]);

            const state = await timeTraveler.getLatestState();
            assert.strictEqual(state.sum, 120);
        });
    });

    describe('getEventsInRange', () => {
        test('returns events in range', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2),
                createTestEvent('subtract', 30, 3),
                createTestEvent('add', 20, 4),
                createTestEvent('subtract', 10, 5)
            ]);

            const events = await timeTraveler.getEventsInRange(2, 4);
            assert.strictEqual(events.length, 3);
            assert.strictEqual(events[0].streamCursor.offset, 2);
            assert.strictEqual(events[2].streamCursor.offset, 4);
        });
    });

    describe('diff', () => {
        test('finds changed keys between states', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2)
            ]);

            const diff = await timeTraveler.diff({ offset: 1 }, { offset: 2 });
            assert.strictEqual(diff.from.state.sum, 100);
            assert.strictEqual(diff.to.state.sum, 150);
            assert.ok(diff.changedKeys.includes('sum'));
        });
    });

    describe('Stepper', () => {
        test('steps through events one by one', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2),
                createTestEvent('subtract', 30, 3)
            ]);

            const stepper = timeTraveler.createStepper();

            let result = await stepper.next();
            assert.strictEqual(result.state.sum, 100);
            assert.strictEqual(result.offset, 1);

            result = await stepper.next();
            assert.strictEqual(result.state.sum, 150);
            assert.strictEqual(result.offset, 2);

            result = await stepper.next();
            assert.strictEqual(result.state.sum, 120);
            assert.strictEqual(result.offset, 3);
            assert.strictEqual(result.isAtEnd, true);
        });

        test('steps multiple events at once', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2),
                createTestEvent('subtract', 30, 3),
                createTestEvent('add', 20, 4)
            ]);

            const stepper = timeTraveler.createStepper();

            const result = await stepper.next(3);
            assert.strictEqual(result.state.sum, 120);
            assert.strictEqual(result.offset, 3);
        });

        test('goto jumps to specific offset', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2),
                createTestEvent('subtract', 30, 3),
                createTestEvent('add', 20, 4)
            ]);

            const stepper = timeTraveler.createStepper();

            const result = await stepper.goto({ offset: 2 });
            assert.strictEqual(result.state.sum, 150);
            assert.strictEqual(result.offset, 2);
        });

        test('reset returns to initial state', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2)
            ]);

            const stepper = timeTraveler.createStepper();
            await stepper.next(2);
            assert.strictEqual(stepper.state.sum, 150);

            await stepper.reset();
            assert.strictEqual(stepper.state.sum, 0);
            assert.strictEqual(stepper.position.offset, -1);
        });

        test('isAtEnd is true when no more events', async () => {
            adapter.addEvent(createTestEvent('add', 100, 1));

            const stepper = timeTraveler.createStepper();
            assert.strictEqual(stepper.isAtEnd, false);

            await stepper.next();
            assert.strictEqual(stepper.isAtEnd, true);
        });

        test('goto returns initial state when target offset is before first event', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 5),
                createTestEvent('add', 50, 6),
                createTestEvent('subtract', 30, 7)
            ]);

            const stepper = timeTraveler.createStepper();
            await stepper.next(2);
            assert.strictEqual(stepper.state.sum, 150);

            const result = await stepper.goto({ offset: 2 });
            assert.strictEqual(result.state.sum, 0, 'Should return initial state when target is before first event');
            assert.strictEqual(result.offset, -1);
            assert.strictEqual(stepper.state.sum, 0);
        });

        test('goto with timestamp before first event returns initial state', async () => {
            const time1 = new Date('2024-01-01T10:00:00Z');
            const time2 = new Date('2024-01-01T11:00:00Z');

            adapter.addEvents([
                createTestEvent('add', 100, 1, time1),
                createTestEvent('add', 50, 2, time2)
            ]);

            const stepper = timeTraveler.createStepper();
            await stepper.next(2);
            assert.strictEqual(stepper.state.sum, 150);

            const result = await stepper.goto({ timestamp: new Date('2024-01-01T09:00:00Z') });
            assert.strictEqual(result.state.sum, 0, 'Should return initial state when timestamp is before first event');
        });

        test('goto with timestamp navigates correctly', async () => {
            const time1 = new Date('2024-01-01T10:00:00Z');
            const time2 = new Date('2024-01-01T11:00:00Z');
            const time3 = new Date('2024-01-01T12:00:00Z');

            adapter.addEvents([
                createTestEvent('add', 100, 1, time1),
                createTestEvent('add', 50, 2, time2),
                createTestEvent('subtract', 30, 3, time3)
            ]);

            const stepper = timeTraveler.createStepper();

            const result = await stepper.goto({ timestamp: new Date('2024-01-01T11:30:00Z') });
            assert.strictEqual(result.state.sum, 150, 'Should navigate to state at timestamp');
            assert.strictEqual(result.offset, 2);
        });

        test('backward navigation restores from checkpoint', async () => {
            const events = [];
            for (let i = 1; i <= 250; i++) {
                events.push(createTestEvent('add', 1, i));
            }
            adapter.addEvents(events);

            const stepper = timeTraveler.createStepper({ checkpointInterval: 50 });

            await stepper.goto({ offset: 200 });
            assert.strictEqual(stepper.state.sum, 200);

            const result = await stepper.goto({ offset: 75 });
            assert.strictEqual(result.state.sum, 75, 'Should restore from nearest checkpoint and replay');
        });

        test('backward navigation to before checkpoint restores correctly', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2),
                createTestEvent('subtract', 30, 3),
                createTestEvent('add', 20, 4),
                createTestEvent('subtract', 10, 5)
            ]);

            const stepper = timeTraveler.createStepper({ checkpointInterval: 2 });

            await stepper.goto({ offset: 5 });
            assert.strictEqual(stepper.state.sum, 130);

            const result = await stepper.goto({ offset: 1 });
            assert.strictEqual(result.state.sum, 100, 'Should navigate backward correctly');
        });
    });

    describe('Abort Signal', () => {
        test('replayTo respects abort signal', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2),
                createTestEvent('subtract', 30, 3)
            ]);

            const controller = new AbortController();
            controller.abort();

            await assert.rejects(
                timeTraveler.replayToOffset(3, { signal: controller.signal }),
                { name: 'AbortError' },
                'Should throw AbortError when signal is aborted'
            );
        });

        test('stepper next respects abort signal', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2)
            ]);

            const stepper = timeTraveler.createStepper();
            const controller = new AbortController();
            controller.abort();

            await assert.rejects(
                stepper.next(1, { signal: controller.signal }),
                { name: 'AbortError' },
                'Should throw AbortError when signal is aborted'
            );
        });

        test('stepper goto respects abort signal', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2)
            ]);

            const stepper = timeTraveler.createStepper();
            const controller = new AbortController();
            controller.abort();

            await assert.rejects(
                stepper.goto({ offset: 2 }, { signal: controller.signal }),
                { name: 'AbortError' },
                'Should throw AbortError when signal is aborted'
            );
        });
    });

    describe('Timestamp Replay', () => {
        test('timestamp replay produces correct result without snapshot', async () => {
            const time1 = new Date('2024-01-01T10:00:00Z');
            const time2 = new Date('2024-01-01T11:00:00Z');
            const time3 = new Date('2024-01-01T12:00:00Z');

            adapter.addEvents([
                createTestEvent('add', 100, 1, time1),
                createTestEvent('add', 50, 2, time2),
                createTestEvent('subtract', 30, 3, time3)
            ]);

            const state = await timeTraveler.replayToTimestamp(new Date('2024-01-01T11:30:00Z'));
            assert.strictEqual(state.sum, 150, 'Should replay to correct timestamp');
        });

        test('timestamp replay returns initial state for timestamp before any events', async () => {
            const time1 = new Date('2024-01-01T10:00:00Z');

            adapter.addEvents([
                createTestEvent('add', 100, 1, time1)
            ]);

            const state = await timeTraveler.replayToTimestamp(new Date('2024-01-01T09:00:00Z'));
            assert.strictEqual(state.sum, 0, 'Should return initial state for timestamp before first event');
        });

        test('timestamp replay uses snapshot when storedAt is before target timestamp', async () => {
            const time1 = new Date('2024-01-01T10:00:00Z');
            const time2 = new Date('2024-01-01T11:00:00Z');
            const time3 = new Date('2024-01-01T12:00:00Z');
            const snapshotStoredAt = new Date('2024-01-01T10:30:00Z');

            adapter.addEvents([
                createTestEvent('add', 100, 1, time1),
                createTestEvent('add', 50, 2, time2),
                createTestEvent('subtract', 30, 3, time3)
            ]);

            // Snapshot captures state after event at offset 1 (sum=100), stored before target
            adapter.setSnapshot('points', 'test-stream', 'Sum',
                new EvDbStoredSnapshotResultRaw(1, snapshotStoredAt, { sum: 100 })
            );

            // Target is after snapshotStoredAt → should use snapshot, replay only events at offset 2
            const state = await timeTraveler.replayToTimestamp(new Date('2024-01-01T11:30:00Z'));
            assert.strictEqual(state.sum, 150, 'Should produce correct state using snapshot as starting point');
        });

        test('timestamp replay falls back to offset 0 when snapshot storedAt is after target timestamp', async () => {
            const time1 = new Date('2024-01-01T10:00:00Z');
            const time2 = new Date('2024-01-01T11:00:00Z');
            const snapshotStoredAt = new Date('2024-01-01T12:00:00Z'); // stored AFTER target

            adapter.addEvents([
                createTestEvent('add', 100, 1, time1),
                createTestEvent('add', 50, 2, time2),
            ]);

            // Snapshot stored after target → must NOT use it, replay from beginning
            adapter.setSnapshot('points', 'test-stream', 'Sum',
                new EvDbStoredSnapshotResultRaw(2, snapshotStoredAt, { sum: 150 })
            );

            const state = await timeTraveler.replayToTimestamp(new Date('2024-01-01T10:30:00Z'));
            assert.strictEqual(state.sum, 100, 'Should replay from beginning when snapshot is after target');
        });
    });

    describe('Diff with Timestamps', () => {
        test('diff returns correct offsets for timestamp targets', async () => {
            const time1 = new Date('2024-01-01T10:00:00Z');
            const time2 = new Date('2024-01-01T11:00:00Z');
            const time3 = new Date('2024-01-01T12:00:00Z');

            adapter.addEvents([
                createTestEvent('add', 100, 1, time1),
                createTestEvent('add', 50, 2, time2),
                createTestEvent('subtract', 30, 3, time3)
            ]);

            const diff = await timeTraveler.diff(
                { timestamp: new Date('2024-01-01T10:30:00Z') },
                { timestamp: new Date('2024-01-01T12:30:00Z') }
            );

            assert.strictEqual(diff.from.state.sum, 100);
            assert.strictEqual(diff.to.state.sum, 120);
            assert.strictEqual(diff.from.offset, 1, 'From offset should be correctly tracked');
            assert.strictEqual(diff.to.offset, 3, 'To offset should be correctly tracked');
        });
    });

    describe('Edge Cases', () => {
        test('replayToOffset with negative offset returns initial state', async () => {
            adapter.addEvent(createTestEvent('add', 100, 1));

            const state = await timeTraveler.replayToOffset(-5);
            assert.strictEqual(state.sum, 0);
        });

        test('getEventsInRange with invalid range returns empty array', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2)
            ]);

            const events = await timeTraveler.getEventsInRange(5, 2);
            assert.strictEqual(events.length, 0, 'Should return empty for reversed range');
        });

        test('stepper handles empty stream', async () => {
            const stepper = timeTraveler.createStepper();

            const result = await stepper.next();
            assert.strictEqual(result.state.sum, 0);
            assert.strictEqual(result.isAtEnd, true);
            assert.strictEqual(result.event, null);
        });

        test('stepper next with count 0 returns current state', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2)
            ]);

            const stepper = timeTraveler.createStepper();
            await stepper.next(1);

            const result = await stepper.next(0);
            assert.strictEqual(result.state.sum, 100);
            assert.strictEqual(result.offset, 1);
        });

        test('stepper next with negative count treated as 0', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2)
            ]);

            const stepper = timeTraveler.createStepper();
            await stepper.next(1);

            const result = await stepper.next(-5);
            assert.strictEqual(result.state.sum, 100);
        });

        test('multiple reset calls work correctly', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2)
            ]);

            const stepper = timeTraveler.createStepper();
            await stepper.next(2);
            assert.strictEqual(stepper.state.sum, 150);

            stepper.reset();
            stepper.reset();
            stepper.reset();

            assert.strictEqual(stepper.state.sum, 0);
            assert.strictEqual(stepper.position.offset, -1);
        });
    });

    describe('Replay Generator', () => {
        test('replay yields each step correctly', async () => {
            adapter.addEvents([
                createTestEvent('add', 100, 1),
                createTestEvent('add', 50, 2),
                createTestEvent('subtract', 30, 3)
            ]);

            const steps = [];
            for await (const step of timeTraveler.replay({ offset: 3 })) {
                steps.push(step);
            }

            assert.strictEqual(steps.length, 3);
            assert.strictEqual(steps[0].state.sum, 100);
            assert.strictEqual(steps[0].offset, 1);
            assert.strictEqual(steps[1].state.sum, 150);
            assert.strictEqual(steps[1].offset, 2);
            assert.strictEqual(steps[2].state.sum, 120);
            assert.strictEqual(steps[2].offset, 3);
            assert.strictEqual(steps[2].isAtEnd, true);
        });

        test('replay with timestamp yields correct steps', async () => {
            const time1 = new Date('2024-01-01T10:00:00Z');
            const time2 = new Date('2024-01-01T11:00:00Z');
            const time3 = new Date('2024-01-01T12:00:00Z');

            adapter.addEvents([
                createTestEvent('add', 100, 1, time1),
                createTestEvent('add', 50, 2, time2),
                createTestEvent('subtract', 30, 3, time3)
            ]);

            const steps = [];
            for await (const step of timeTraveler.replay({ timestamp: new Date('2024-01-01T11:30:00Z') })) {
                steps.push(step);
            }

            assert.strictEqual(steps.length, 2);
            assert.strictEqual(steps[0].state.sum, 100);
            assert.strictEqual(steps[1].state.sum, 150);
        });

        test('replay yields nothing for empty stream', async () => {
            const steps = [];
            for await (const step of timeTraveler.replay({ offset: 10 })) {
                steps.push(step);
            }

            assert.strictEqual(steps.length, 0);
        });
    });

    describe('Checkpoint Management', () => {
        test('checkpoints are created at correct intervals', async () => {
            const events = [];
            for (let i = 1; i <= 10; i++) {
                events.push(createTestEvent('add', 10, i));
            }
            adapter.addEvents(events);

            const stepper = timeTraveler.createStepper({ checkpointInterval: 3 });
            await stepper.goto({ offset: 10 });

            await stepper.goto({ offset: 3 });
            assert.strictEqual(stepper.state.sum, 30);

            await stepper.goto({ offset: 6 });
            assert.strictEqual(stepper.state.sum, 60);
        });

        test('maxCheckpoints limits checkpoint count', async () => {
            const events = [];
            for (let i = 1; i <= 500; i++) {
                events.push(createTestEvent('add', 1, i));
            }
            adapter.addEvents(events);

            const stepper = timeTraveler.createStepper({ 
                checkpointInterval: 10,
                maxCheckpoints: 5 
            });
            
            await stepper.goto({ offset: 500 });
            assert.strictEqual(stepper.state.sum, 500);

            await stepper.goto({ offset: 50 });
            assert.strictEqual(stepper.state.sum, 50);
        });
    });
});
