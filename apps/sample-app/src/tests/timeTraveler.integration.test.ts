import * as assert from 'node:assert';
import { test, describe, before, after } from 'node:test';
import Steps, { EVENT_STORE_TYPE } from './steps.js';
import { TestManager } from './TestContainerManager/TestManager.js';
import { createTimeTraveler } from '@eventualize/core';
import { createViewFactory } from '@eventualize/core/EvDbViewFactory';
import { EvDbPrismaStorageAdapter } from '@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter';
import EvDbDynamoDbStorageAdapter from '@eventualize/dynamodb-storage-adapter/EvDbDynamoDbStorageAdapter';
import { PointsAdded, PointsSubtracted, PointsMultiplied, PointsStreamEvents } from '../eventstore/PointsStream/events.js';
import { SumViewState, sumViewHandlers } from '../eventstore/PointsStream/views.js';
import { IEvDbStorageAdapter } from '@eventualize/core/EvDbEventStore';

describe('TimeTraveler Integration Tests', () => {
    const testManager: TestManager = new TestManager();

    before(async () => {
        await testManager.start();
    });

    after(async () => {
        await testManager.stop();
    });

    test('TimeTraveler with real storage adapters', async () => {
        const databasesToTest = testManager.supportedDatabases;

        for (const storeType of databasesToTest) {
            await test(`${storeType}: TimeTraveler functionality`, async t => {
                const testData: any = {};

                t.before(async () => {
                    const connectionConfig = testManager.getConnection(storeType);
                    if (storeType !== EVENT_STORE_TYPE.DYNAMODB) {
                        testData.storeClient = Steps.createStoreClient(storeType, connectionConfig as string | undefined);
                    }
                    const dynamoDbOptions = testManager.getDynamoDbOptions();
                    testData.eventStore = Steps.createEventStore(testData.storeClient, storeType, dynamoDbOptions);

                    testData.storageAdapter = storeType === EVENT_STORE_TYPE.DYNAMODB
                        ? EvDbDynamoDbStorageAdapter.withOptions(dynamoDbOptions ?? {})
                        : new EvDbPrismaStorageAdapter(testData.storeClient);

                    await Steps.clearEnvironment(testData.storeClient, storeType, dynamoDbOptions);
                });

                await t.test('Setup: Store events for time travel tests', async () => {
                    testData.streamId = `timeTravelStream-${Date.now()}`;
                    testData.pointsStream = Steps.createPointsStream(testData.streamId, testData.eventStore);

                    testData.pointsStream.appendEventPointsAdded(new PointsAdded(100));
                    testData.pointsStream.appendEventPointsSubtracted(new PointsSubtracted(30));
                    testData.pointsStream.appendEventPointsAdded(new PointsAdded(50));
                    testData.pointsStream.appendEventPointsMultiplied(new PointsMultiplied(2));
                    testData.pointsStream.appendEventPointsSubtracted(new PointsSubtracted(40));

                    await testData.pointsStream.store();
                });

                await t.test('TimeTraveler: replayToOffset returns correct state', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const stateAt1 = await timeTraveler.replayToOffset(1);
                    assert.strictEqual(stateAt1.sum, 100, 'State at offset 1 should be 100');

                    const stateAt2 = await timeTraveler.replayToOffset(2);
                    assert.strictEqual(stateAt2.sum, 70, 'State at offset 2 should be 70 (100-30)');

                    const stateAt3 = await timeTraveler.replayToOffset(3);
                    assert.strictEqual(stateAt3.sum, 120, 'State at offset 3 should be 120 (100-30+50)');

                    const stateAt4 = await timeTraveler.replayToOffset(4);
                    assert.strictEqual(stateAt4.sum, 240, 'State at offset 4 should be 240 (120*2)');

                    const stateAt5 = await timeTraveler.replayToOffset(5);
                    assert.strictEqual(stateAt5.sum, 200, 'State at offset 5 should be 200 (240-40)');
                });

                await t.test('TimeTraveler: getLatestState returns final state', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const latestState = await timeTraveler.getLatestState();
                    assert.strictEqual(latestState.sum, 200, 'Latest state should be 200');
                });

                await t.test('TimeTraveler: getEventsInRange returns correct events', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const events = await timeTraveler.getEventsInRange(2, 4);
                    assert.strictEqual(events.length, 3, 'Should return 3 events (offsets 2, 3, 4)');
                    assert.strictEqual(events[0].eventType, 'PointsSubtracted');
                    assert.strictEqual(events[1].eventType, 'PointsAdded');
                    assert.strictEqual(events[2].eventType, 'PointsMultiplied');
                });

                await t.test('TimeTraveler: diff shows state changes', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const diff = await timeTraveler.diff({ offset: 1 }, { offset: 4 });
                    assert.strictEqual(diff.from.state.sum, 100);
                    assert.strictEqual(diff.to.state.sum, 240);
                    assert.ok(diff.changedKeys.includes('sum'));
                });

                await t.test('TimeTraveler: Stepper walks through events', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const stepper = timeTraveler.createStepper();

                    let result = await stepper.next();
                    assert.strictEqual(result.state.sum, 100);

                    result = await stepper.next();
                    assert.strictEqual(result.state.sum, 70);

                    result = await stepper.goto({ offset: 4 });
                    assert.strictEqual(result.state.sum, 240);

                    stepper.reset();
                    assert.strictEqual(stepper.state.sum, 0);
                });

                await t.test('TimeTraveler: Stepper backward navigation works correctly', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const stepper = timeTraveler.createStepper({ checkpointInterval: 2 });

                    await stepper.goto({ offset: 5 });
                    assert.strictEqual(stepper.state.sum, 200, 'Should be at final state');

                    const result = await stepper.goto({ offset: 2 });
                    assert.strictEqual(result.state.sum, 70, 'Should navigate backward correctly');
                    assert.strictEqual(result.offset, 2);

                    const result2 = await stepper.goto({ offset: 1 });
                    assert.strictEqual(result2.state.sum, 100, 'Should navigate to first event');
                });

                await t.test('TimeTraveler: goto before first event returns initial state', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const stepper = timeTraveler.createStepper();

                    await stepper.goto({ offset: 3 });
                    assert.strictEqual(stepper.state.sum, 120);

                    const result = await stepper.goto({ offset: 0 });
                    assert.strictEqual(result.state.sum, 0, 'Should return initial state for offset before first event');
                    assert.strictEqual(result.offset, -1);
                });

                await t.test('TimeTraveler: Abort signal cancels replay', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const controller = new AbortController();
                    controller.abort();

                    await assert.rejects(
                        timeTraveler.replayToOffset(5, { signal: controller.signal }),
                        { name: 'AbortError' },
                        'Should throw AbortError when signal is already aborted'
                    );
                });

                await t.test('TimeTraveler: replay generator yields correct steps', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const steps = [];
                    for await (const step of timeTraveler.replay({ offset: 3 })) {
                        steps.push(step);
                    }

                    assert.strictEqual(steps.length, 3, 'Should yield 3 steps');
                    assert.strictEqual(steps[0].state.sum, 100);
                    assert.strictEqual(steps[0].offset, 1);
                    assert.strictEqual(steps[1].state.sum, 70);
                    assert.strictEqual(steps[1].offset, 2);
                    assert.strictEqual(steps[2].state.sum, 120);
                    assert.strictEqual(steps[2].offset, 3);
                });

                await t.test('TimeTraveler: replayToOffset with negative offset returns initial state', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const state = await timeTraveler.replayToOffset(-5);
                    assert.strictEqual(state.sum, 0, 'Should return initial state for negative offset');
                });

                await t.test('TimeTraveler: Stepper steps multiple events at once', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const stepper = timeTraveler.createStepper();

                    const result = await stepper.next(3);
                    assert.strictEqual(result.state.sum, 120, 'Should apply 3 events at once');
                    assert.strictEqual(result.offset, 3);
                });

                await t.test('TimeTraveler: Stepper isAtEnd reflects correct state', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const stepper = timeTraveler.createStepper();

                    await stepper.next(4);
                    assert.strictEqual(stepper.isAtEnd, false, 'Should not be at end after 4 events');

                    await stepper.next();
                    assert.strictEqual(stepper.isAtEnd, true, 'Should be at end after all 5 events');
                });

                await t.test('TimeTraveler: replayToTimestamp returns correct state', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const events = await timeTraveler.getEventsInRange(1, 5);
                    assert.ok(events.length >= 2, 'Should have at least 2 events');

                    const lastEventTimestamp = events[events.length - 1].capturedAt;
                    const state = await timeTraveler.replayToTimestamp(lastEventTimestamp);
                    assert.strictEqual(state.sum, 200, 'State at last event timestamp should be 200');
                });

                await t.test('TimeTraveler: Stepper goto with timestamp navigates correctly', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const events = await timeTraveler.getEventsInRange(1, 5);
                    const stepper = timeTraveler.createStepper();

                    const lastEventTimestamp = events[events.length - 1].capturedAt;
                    const result = await stepper.goto({ timestamp: lastEventTimestamp });
                    assert.strictEqual(result.state.sum, 200, 'Should navigate to final state');
                });

                await t.test('TimeTraveler: Stepper goto timestamp before first event returns initial state', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const events = await timeTraveler.getEventsInRange(1, 5);
                    const stepper = timeTraveler.createStepper();

                    const beforeFirstEventTimestamp = new Date(events[0].capturedAt.getTime() - 1000);
                    const result = await stepper.goto({ timestamp: beforeFirstEventTimestamp });
                    assert.strictEqual(result.state.sum, 0, 'Should return initial state for timestamp before first event');
                });

                await t.test('TimeTraveler: diff with timestamps shows state changes', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum',
                        streamType: 'PointsStream',
                        defaultState: new SumViewState(),
                        handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(
                        adapter,
                        adapter,
                        sumViewFactory,
                        testData.streamId
                    );

                    const events = await timeTraveler.getEventsInRange(1, 5);
                    const beforeFirstTimestamp = new Date(events[0].capturedAt.getTime() - 1000);
                    const lastTimestamp = events[events.length - 1].capturedAt;

                    const diff = await timeTraveler.diff(
                        { timestamp: beforeFirstTimestamp },
                        { timestamp: lastTimestamp }
                    );

                    assert.ok(diff.changedKeys.includes('sum'), 'sum should be in changed keys');
                    assert.strictEqual(diff.from.state.sum, 0, 'From state should be 0 (before first event)');
                    assert.strictEqual(diff.to.state.sum, 200, 'To state should be 200');
                });

                await t.test('TimeTraveler: empty stream returns initial state for all ops', async () => {
                    const emptyStreamId = `emptyStream-${Date.now()}`;
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum', streamType: 'PointsStream',
                        defaultState: new SumViewState(), handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(adapter, adapter, sumViewFactory, emptyStreamId);

                    const latest = await timeTraveler.getLatestState();
                    assert.strictEqual(latest.sum, 0, 'getLatestState on empty stream should return default state');

                    const atOffset = await timeTraveler.replayToOffset(0);
                    assert.strictEqual(atOffset.sum, 0, 'replayToOffset on empty stream should return default state');

                    const stepper = timeTraveler.createStepper();
                    const result = await stepper.next();
                    assert.strictEqual(result.state.sum, 0, 'next() on empty stream should return default state');
                    assert.strictEqual(result.event, null, 'event should be null on empty stream');
                    assert.strictEqual(result.isAtEnd, true, 'isAtEnd should be true on empty stream');
                });

                await t.test('TimeTraveler: diff with same offset returns empty changedKeys', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum', streamType: 'PointsStream',
                        defaultState: new SumViewState(), handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(adapter, adapter, sumViewFactory, testData.streamId);

                    const diff = await timeTraveler.diff({ offset: 3 }, { offset: 3 });
                    assert.strictEqual(diff.from.state.sum, diff.to.state.sum, 'States should be equal');
                    assert.strictEqual(diff.changedKeys.length, 0, 'changedKeys should be empty when diffing same offset');
                });

                await t.test('TimeTraveler: diff result from.offset and to.offset are correct', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum', streamType: 'PointsStream',
                        defaultState: new SumViewState(), handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(adapter, adapter, sumViewFactory, testData.streamId);

                    const diff = await timeTraveler.diff({ offset: 2 }, { offset: 5 });
                    assert.strictEqual(diff.from.offset, 2, 'from.offset should be 2');
                    assert.strictEqual(diff.to.offset, 5, 'to.offset should be 5');
                    assert.strictEqual(diff.from.state.sum, 70, 'from state should be 70');
                    assert.strictEqual(diff.to.state.sum, 200, 'to state should be 200');
                });

                await t.test('TimeTraveler: getEventsInRange edge cases', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum', streamType: 'PointsStream',
                        defaultState: new SumViewState(), handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(adapter, adapter, sumViewFactory, testData.streamId);

                    const single = await timeTraveler.getEventsInRange(3, 3);
                    assert.strictEqual(single.length, 1, 'Single-event range should return exactly 1 event');
                    assert.strictEqual(single[0].eventType, 'PointsAdded');

                    const inverted = await timeTraveler.getEventsInRange(4, 2);
                    assert.strictEqual(inverted.length, 0, 'Inverted range should return 0 events');
                });

                await t.test('TimeTraveler: two independent steppers navigate without interference', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum', streamType: 'PointsStream',
                        defaultState: new SumViewState(), handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(adapter, adapter, sumViewFactory, testData.streamId);

                    const stepperA = timeTraveler.createStepper();
                    const stepperB = timeTraveler.createStepper();

                    await stepperA.next(3);
                    assert.strictEqual(stepperA.state.sum, 120, 'Stepper A should be at offset 3 state');
                    assert.strictEqual(stepperB.state.sum, 0, 'Stepper B should still be at initial state');

                    await stepperB.goto({ offset: 5 });
                    assert.strictEqual(stepperB.state.sum, 200, 'Stepper B should reach final state');
                    assert.strictEqual(stepperA.state.sum, 120, 'Stepper A should be unaffected by B');
                });

                await t.test('TimeTraveler: next() past end is idempotent', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum', streamType: 'PointsStream',
                        defaultState: new SumViewState(), handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(adapter, adapter, sumViewFactory, testData.streamId);

                    const stepper = timeTraveler.createStepper();
                    await stepper.goto({ offset: 5 });
                    assert.strictEqual(stepper.isAtEnd, true);

                    const result = await stepper.next();
                    assert.strictEqual(result.state.sum, 200, 'Should remain at final state after next() past end');
                    assert.strictEqual(result.isAtEnd, true, 'Should still be at end');
                });

                await t.test('TimeTraveler: stepper.position tracks navigation', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum', streamType: 'PointsStream',
                        defaultState: new SumViewState(), handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(adapter, adapter, sumViewFactory, testData.streamId);
                    const stepper = timeTraveler.createStepper();

                    assert.strictEqual(stepper.position.offset, -1, 'Initial position should be -1');

                    await stepper.next();
                    assert.strictEqual(stepper.position.offset, 1, 'After next(), position should be 1');

                    await stepper.goto({ offset: 4 });
                    assert.strictEqual(stepper.position.offset, 4, 'After goto(4), position should be 4');

                    stepper.reset();
                    assert.strictEqual(stepper.position.offset, -1, 'After reset(), position should be -1');
                });

                await t.test('TimeTraveler: replay() last step has isAtEnd=true, others false', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum', streamType: 'PointsStream',
                        defaultState: new SumViewState(), handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(adapter, adapter, sumViewFactory, testData.streamId);

                    const steps = [];
                    for await (const step of timeTraveler.replay({ offset: 5 })) {
                        steps.push(step);
                    }

                    assert.strictEqual(steps.length, 5, 'Should yield all 5 events');
                    assert.strictEqual(steps[4].isAtEnd, true, 'Last step should have isAtEnd=true');
                    for (let i = 0; i < 4; i++) {
                        assert.strictEqual(steps[i].isAtEnd, false, `Step ${i} should not be at end`);
                    }
                });

                await t.test('TimeTraveler: zigzag navigation produces consistent state', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum', streamType: 'PointsStream',
                        defaultState: new SumViewState(), handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(adapter, adapter, sumViewFactory, testData.streamId);
                    const stepper = timeTraveler.createStepper({ checkpointInterval: 1 });

                    await stepper.goto({ offset: 5 });
                    const forward = stepper.state.sum;

                    await stepper.goto({ offset: 2 });
                    const backward = stepper.state.sum;

                    await stepper.goto({ offset: 5 });
                    const forwardAgain = stepper.state.sum;

                    assert.strictEqual(forward, 200);
                    assert.strictEqual(backward, 70);
                    assert.strictEqual(forwardAgain, 200, 'Re-navigating to same offset gives identical state');
                });

                await t.test('TimeTraveler: replayToTimestamp with future date returns latest state', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum', streamType: 'PointsStream',
                        defaultState: new SumViewState(), handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(adapter, adapter, sumViewFactory, testData.streamId);

                    const futureDate = new Date('2099-01-01T00:00:00Z');
                    const state = await timeTraveler.replayToTimestamp(futureDate);
                    assert.strictEqual(state.sum, 200, 'Future timestamp should return final state');
                });

                await t.test('TimeTraveler: stepper with small windowSize correctly paginates', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum', streamType: 'PointsStream',
                        defaultState: new SumViewState(), handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(adapter, adapter, sumViewFactory, testData.streamId);

                    // windowSize: 2 with 5 events forces multiple window loads during traversal
                    const stepper = timeTraveler.createStepper({ windowSize: 2, checkpointInterval: 1 });

                    const result = await stepper.goto({ offset: 5 });
                    assert.strictEqual(result.state.sum, 200, 'Small windowSize should still reach correct final state');

                    const backward = await stepper.goto({ offset: 2 });
                    assert.strictEqual(backward.state.sum, 70, 'Backward through window boundary should give correct state');
                });

                await t.test('TimeTraveler: reset() then next() is repeatable and deterministic', async () => {
                    const sumViewFactory = createViewFactory<SumViewState, PointsStreamEvents>({
                        viewName: 'Sum', streamType: 'PointsStream',
                        defaultState: new SumViewState(), handlers: sumViewHandlers
                    });

                    const adapter = testData.storageAdapter as IEvDbStorageAdapter;
                    const timeTraveler = createTimeTraveler(adapter, adapter, sumViewFactory, testData.streamId);
                    const stepper = timeTraveler.createStepper();

                    const firstRun = await stepper.next();
                    stepper.reset();
                    const secondRun = await stepper.next();

                    assert.strictEqual(firstRun.state.sum, secondRun.state.sum,
                        'First event after reset() should be identical each time');
                    assert.strictEqual(firstRun.offset, secondRun.offset,
                        'Offset after reset() should be identical each time');
                });

                t.after(async () => {
                    await Steps.clearEnvironment(testData.storeClient, storeType, testManager.getDynamoDbOptions());
                    await testData.storageAdapter?.close?.();
                });
            });
        }
    });
});
