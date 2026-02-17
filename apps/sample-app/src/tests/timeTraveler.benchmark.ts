/**
 * Time-Traveler Load / Performance Benchmark
 *
 * Scenarios
 *  1. Replay throughput          — replayToOffset across increasing stream sizes
 *  2. Stepper forward            — sequential next() across the stream
 *  3. Stepper backward (goto)    — random backward jumps, with/without checkpoints
 *  4. Concurrent diff            — K parallel diff() calls
 *
 * Targets
 *  A. In-memory adapter (pure algorithm, no I/O)
 *  B. Real DB adapters (MySQL, Postgres, DynamoDB) via test-containers
 *
 * Usage
 *   # in-memory only (fast, no Docker needed)
 *   node --import tsx/esm src/tests/timeTraveler.benchmark.ts
 *
 *   # with real DBs
 *   TEST_CONTAINER=true TEST_DATABASES=MySQL,Postgres,DynamoDB \
 *   node --import tsx/esm src/tests/timeTraveler.benchmark.ts
 */

import { performance } from 'node:perf_hooks';
import { createTimeTraveler } from '@eventualize/core';
import { createViewFactory } from '@eventualize/core/EvDbViewFactory';
import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';
import EvDbViewAddress from '@eventualize/types/EvDbViewAddress';
import { EvDbStoredSnapshotData } from '@eventualize/types/EvDbStoredSnapshotData';
import { EvDbStoredSnapshotResultRaw } from '@eventualize/types/EvDbStoredSnapshotResult';
import EvDbEvent from '@eventualize/types/EvDbEvent';
import EvDbMessage from '@eventualize/types/EvDbMessage';
import EvDbMessageFilter from '@eventualize/types/EvDbMessageFilter';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress';
import EvDbStreamCursor from '@eventualize/types/EvDbStreamCursor';
import EvDbContinuousFetchOptions from '@eventualize/types/EvDbContinuousFetchOptions';
import { EvDbShardName } from '@eventualize/types/primitiveTypes';
import StreamStoreAffected from '@eventualize/types/StreamStoreAffected';
import IEvDbEventPayload from '@eventualize/types/IEvDbEventPayload';
import { EvDbPrismaStorageAdapter } from '@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter';
import EvDbDynamoDbStorageAdapter from '@eventualize/dynamodb-storage-adapter/EvDbDynamoDbStorageAdapter';
import Steps, { EVENT_STORE_TYPE } from './steps.js';
import { TestManager } from './TestContainerManager/TestManager.js';
import { IEvDbStorageAdapter } from '@eventualize/core/EvDbEventStore';
import { PointsAdded, PointsSubtracted, PointsMultiplied } from '../eventstore/PointsStream/events.js';

// ─────────────────────────────────────────────────────────────────────────────
// In-memory adapter (no I/O — identical to the one in EvDbTimeTraveler.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

class InMemoryAdapter implements IEvDbStorageSnapshotAdapter, IEvDbStorageStreamAdapter {
    private events: EvDbEvent[] = [];
    private snapshots: Map<string, EvDbStoredSnapshotResultRaw> = new Map();

    seed(events: EvDbEvent[]): void { this.events = [...events]; }
    clear(): void { this.events = []; this.snapshots.clear(); }

    async close(): Promise<void> {}

    async *getEventsAsync(cursor: EvDbStreamCursor): AsyncGenerator<EvDbEvent, void, undefined> {
        for (const e of this.events) {
            if (
                e.streamCursor.streamType === cursor.streamType &&
                e.streamCursor.streamId  === cursor.streamId  &&
                e.streamCursor.offset   >= cursor.offset
            ) yield e;
        }
    }

    async getLastOffsetAsync(addr: EvDbStreamAddress): Promise<number> {
        const filtered = this.events.filter(
            e => e.streamCursor.streamType === addr.streamType &&
                 e.streamCursor.streamId   === addr.streamId
        );
        return filtered.length === 0 ? -1 : Math.max(...filtered.map(e => e.streamCursor.offset));
    }

    async storeStreamAsync(events: ReadonlyArray<EvDbEvent>): Promise<StreamStoreAffected> {
        this.events.push(...events);
        return new StreamStoreAffected(events.length, new Map());
    }

    async getSnapshotAsync(addr: EvDbViewAddress): Promise<EvDbStoredSnapshotResultRaw> {
        const key = `${addr.streamType}:${addr.streamId}:${addr.viewName}`;
        return this.snapshots.get(key) ?? EvDbStoredSnapshotResultRaw.Empty;
    }

    async storeSnapshotAsync(data: EvDbStoredSnapshotData): Promise<void> {
        const key = `${data.streamType}:${data.streamId}:${data.viewName}`;
        this.snapshots.set(key, new EvDbStoredSnapshotResultRaw(data.offset, data.storedAt, data.state));
    }

    // Unused outbox methods required by the interface
    getFromOutbox(_f: EvDbMessageFilter, _o?: EvDbContinuousFetchOptions | null): Promise<AsyncIterable<EvDbMessage>> { throw new Error('N/A'); }
    getFromOutboxAsync(_s: EvDbShardName, _f: EvDbMessageFilter): AsyncIterable<EvDbMessage> { throw new Error('N/A'); }
    getRecordsFromOutboxAsync(..._args: unknown[]): AsyncIterable<EvDbMessage> { throw new Error('N/A'); }
    subscribeToMessageAsync(..._args: unknown[]): Promise<void> { throw new Error('N/A'); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain — simple accumulator view
// ─────────────────────────────────────────────────────────────────────────────

interface SumState { sum: number }
type BenchEvents = PointsAdded | PointsSubtracted | PointsMultiplied;

const sumViewFactory = createViewFactory<SumState, BenchEvents>({
    viewName: 'Sum',
    streamType: 'PointsStream',
    defaultState: { sum: 0 },
    handlers: {
        PointsAdded:      (s, e) => ({ sum: s.sum + e.points }),
        PointsSubtracted: (s, e) => ({ sum: s.sum - e.points }),
        PointsMultiplied: (s, e) => ({ sum: s.sum * e.multiplier }),
    }
});

function makeEvent(offset: number, streamId: string): EvDbEvent {
    const payload = new PointsAdded(1);
    return new EvDbEvent(
        payload.payloadType,
        new EvDbStreamCursor('PointsStream', streamId, offset),
        payload,
        new Date()
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark utilities
// ─────────────────────────────────────────────────────────────────────────────

interface BenchResult {
    scenario: string;
    target: string;
    events: number;
    iterations: number;
    meanMs: number;
    minMs: number;
    maxMs: number;
    throughputEvtPerSec: number;
    memDeltaMb: number;
}

const results: BenchResult[] = [];

async function measure(
    label: string,
    target: string,
    eventCount: number,
    iterations: number,
    fn: () => Promise<void>
): Promise<void> {
    // Warmup
    await fn();

    const times: number[] = [];
    const memBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        await fn();
        times.push(performance.now() - t0);
    }

    const memAfter = process.memoryUsage().heapUsed;
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const min  = Math.min(...times);
    const max  = Math.max(...times);

    results.push({
        scenario: label,
        target,
        events: eventCount,
        iterations,
        meanMs: +mean.toFixed(2),
        minMs:  +min.toFixed(2),
        maxMs:  +max.toFixed(2),
        throughputEvtPerSec: Math.round(eventCount / (mean / 1000)),
        memDeltaMb: +((memAfter - memBefore) / 1024 / 1024).toFixed(2),
    });
}

function printTable(rows: BenchResult[]): void {
    const cols = [
        { key: 'scenario',            label: 'Scenario',          pad: 40 },
        { key: 'target',              label: 'Target',             pad: 10 },
        { key: 'events',              label: 'Events',             pad: 8  },
        { key: 'iterations',          label: 'Iter',               pad: 6  },
        { key: 'meanMs',              label: 'Mean ms',            pad: 9  },
        { key: 'minMs',               label: 'Min ms',             pad: 8  },
        { key: 'maxMs',               label: 'Max ms',             pad: 8  },
        { key: 'throughputEvtPerSec', label: 'Events/sec',         pad: 12 },
        { key: 'memDeltaMb',          label: 'ΔMem MB',            pad: 9  },
    ] as const;

    const header = cols.map(c => c.label.padStart(c.pad)).join(' │ ');
    const divider = cols.map(c => '─'.repeat(c.pad)).join('─┼─');

    console.log('\n' + '═'.repeat(header.length));
    console.log(' Time-Traveler Benchmark Results');
    console.log('═'.repeat(header.length));
    console.log(header);
    console.log(divider);

    for (const row of rows) {
        const line = cols.map(c => String(row[c.key]).padStart(c.pad)).join(' │ ');
        console.log(line);
    }

    console.log('═'.repeat(header.length) + '\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark scenarios
// ─────────────────────────────────────────────────────────────────────────────

async function benchReplayThroughput(
    adapter: InMemoryAdapter | IEvDbStorageAdapter,
    targetLabel: string,
    streamId: string,
    eventCount: number,
    iterations: number
): Promise<void> {
    const tt = createTimeTraveler(
        adapter as IEvDbStorageStreamAdapter,
        adapter as IEvDbStorageSnapshotAdapter,
        sumViewFactory,
        streamId
    );

    await measure(
        `replayToOffset (full stream)`,
        targetLabel,
        eventCount,
        iterations,
        async () => { await tt.replayToOffset(eventCount); }
    );
}

async function benchStepperForward(
    adapter: InMemoryAdapter | IEvDbStorageAdapter,
    targetLabel: string,
    streamId: string,
    eventCount: number,
    iterations: number,
    reuseAcrossIterations = false
): Promise<void> {
    const tt = createTimeTraveler(
        adapter as IEvDbStorageStreamAdapter,
        adapter as IEvDbStorageSnapshotAdapter,
        sumViewFactory,
        streamId
    );

    if (reuseAcrossIterations) {
        // Create and warm the stepper once, then reset between iterations.
        // This measures steady-state navigation without per-iteration init cost —
        // appropriate for DB adapters where initialization is expensive.
        const stepper = tt.createStepper();
        await stepper.goto({ offset: eventCount }); // warmup / init

        const times: number[] = [];
        const memBefore = process.memoryUsage().heapUsed;
        for (let i = 0; i < iterations; i++) {
            stepper.reset();
            const t0 = performance.now();
            while (!(await stepper.next()).isAtEnd) { /* walk */ }
            times.push(performance.now() - t0);
        }
        const memAfter = process.memoryUsage().heapUsed;
        const mean = times.reduce((a, b) => a + b, 0) / times.length;
        results.push({
            scenario: `Stepper: forward next() full stream`,
            target: targetLabel,
            events: eventCount,
            iterations,
            meanMs: +mean.toFixed(2),
            minMs: +Math.min(...times).toFixed(2),
            maxMs: +Math.max(...times).toFixed(2),
            throughputEvtPerSec: Math.round(eventCount / (mean / 1000)),
            memDeltaMb: +((memAfter - memBefore) / 1024 / 1024).toFixed(2),
        });
    } else {
        await measure(
            `Stepper: forward next() full stream`,
            targetLabel,
            eventCount,
            iterations,
            async () => {
                const stepper = tt.createStepper();
                while (!(await stepper.next()).isAtEnd) { /* walk */ }
            }
        );
    }
}

async function benchStepperBackward(
    adapter: InMemoryAdapter | IEvDbStorageAdapter,
    targetLabel: string,
    streamId: string,
    eventCount: number,
    checkpointInterval: number,
    iterations: number,
    reuseAcrossIterations = false
): Promise<void> {
    const tt = createTimeTraveler(
        adapter as IEvDbStorageStreamAdapter,
        adapter as IEvDbStorageSnapshotAdapter,
        sumViewFactory,
        streamId
    );

    // Jump pattern: go to end, jump halfway back, go to 25%, jump to 75%
    const offsets = [eventCount, Math.floor(eventCount / 2), Math.floor(eventCount / 4), Math.floor(eventCount * 3 / 4)];

    if (reuseAcrossIterations) {
        const stepper = tt.createStepper({ checkpointInterval });
        await stepper.goto({ offset: eventCount }); // warmup / init + cache checkpoints

        const times: number[] = [];
        const memBefore = process.memoryUsage().heapUsed;
        for (let i = 0; i < iterations; i++) {
            stepper.reset();
            const t0 = performance.now();
            for (const offset of offsets) {
                await stepper.goto({ offset });
            }
            times.push(performance.now() - t0);
        }
        const memAfter = process.memoryUsage().heapUsed;
        const mean = times.reduce((a, b) => a + b, 0) / times.length;
        results.push({
            scenario: `Stepper: backward goto (ckpt=${checkpointInterval})`,
            target: targetLabel,
            events: eventCount,
            iterations,
            meanMs: +mean.toFixed(2),
            minMs: +Math.min(...times).toFixed(2),
            maxMs: +Math.max(...times).toFixed(2),
            throughputEvtPerSec: Math.round(eventCount / (mean / 1000)),
            memDeltaMb: +((memAfter - memBefore) / 1024 / 1024).toFixed(2),
        });
    } else {
        await measure(
            `Stepper: backward goto (ckpt=${checkpointInterval})`,
            targetLabel,
            eventCount,
            iterations,
            async () => {
                const stepper = tt.createStepper({ checkpointInterval });
                for (const offset of offsets) {
                    await stepper.goto({ offset });
                }
            }
        );
    }
}

async function benchConcurrentDiff(
    adapter: InMemoryAdapter | IEvDbStorageAdapter,
    targetLabel: string,
    streamId: string,
    eventCount: number,
    concurrency: number,
    iterations: number
): Promise<void> {
    const tt = createTimeTraveler(
        adapter as IEvDbStorageStreamAdapter,
        adapter as IEvDbStorageSnapshotAdapter,
        sumViewFactory,
        streamId
    );

    const step = Math.floor(eventCount / concurrency);

    await measure(
        `Concurrent diff (concurrency=${concurrency})`,
        targetLabel,
        eventCount,
        iterations,
        () => Promise.all(
            Array.from({ length: concurrency }, (_, i) =>
                tt.diff({ offset: i * step + 1 }, { offset: (i + 1) * step })
            )
        ).then(() => undefined)
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory suite
// ─────────────────────────────────────────────────────────────────────────────

async function runInMemorySuite(): Promise<void> {
    console.log('\n▶  Running in-memory benchmarks …');
    const adapter = new InMemoryAdapter();
    const sizes = [1_000, 10_000, 100_000];

    for (const n of sizes) {
        const streamId = `bench-mem-${n}`;
        const events = Array.from({ length: n }, (_, i) => makeEvent(i + 1, streamId));
        adapter.seed(events);

        const iters = n <= 10_000 ? 5 : 3;

        await benchReplayThroughput(adapter, 'in-memory', streamId, n, iters);
        await benchStepperForward(adapter, 'in-memory', streamId, n, iters);
        await benchStepperBackward(adapter, 'in-memory', streamId, n, 100, iters);
        await benchStepperBackward(adapter, 'in-memory', streamId, n, 500, iters);
        await benchConcurrentDiff(adapter, 'in-memory', streamId, n, 4, iters);

        adapter.clear();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Real-DB suite
// ─────────────────────────────────────────────────────────────────────────────

async function seedRealDb(
    storeType: EVENT_STORE_TYPE,
    testManager: TestManager,
    streamId: string,
    eventCount: number
): Promise<void> {
    const connectionConfig = testManager.getConnection(storeType);
    const storeClient = storeType !== EVENT_STORE_TYPE.DYNAMODB
        ? Steps.createStoreClient(storeType, connectionConfig as string | undefined)
        : undefined;
    const dynamoDbOptions = testManager.getDynamoDbOptions();
    const eventStore = Steps.createEventStore(storeClient, storeType, dynamoDbOptions);
    const stream = Steps.createPointsStream(streamId, eventStore);

    // DynamoDB BatchWriteItem max = 25 items; relational adapters handle larger batches fine.
    const BATCH = storeType === EVENT_STORE_TYPE.DYNAMODB ? 20 : 500;
    for (let i = 0; i < eventCount; i += BATCH) {
        const batchSize = Math.min(BATCH, eventCount - i);
        for (let j = 0; j < batchSize; j++) {
            stream.appendEventPointsAdded(new PointsAdded(1));
        }
        await stream.store();
    }
}

async function runRealDbSuite(testManager: TestManager): Promise<void> {
    // DynamoDB LocalStack has high per-call latency (~50ms); use small sizes and
    // reuse the stepper across iterations to avoid repeated cold-init cost.
    const isDynamo = (t: EVENT_STORE_TYPE) => t === EVENT_STORE_TYPE.DYNAMODB;
    const sizesByDb: Partial<Record<EVENT_STORE_TYPE, number[]>> = {
        [EVENT_STORE_TYPE.DYNAMODB]: [100, 300],
    };
    const defaultSizes = [1_000, 10_000, 100_000];

    for (const storeType of testManager.supportedDatabases) {
        console.log(`\n▶  Running ${storeType} benchmarks …`);
        const connectionConfig = testManager.getConnection(storeType);
        const storeClient = !isDynamo(storeType)
            ? Steps.createStoreClient(storeType, connectionConfig as string | undefined)
            : undefined;
        const dynamoDbOptions = testManager.getDynamoDbOptions();

        const storageAdapter: IEvDbStorageAdapter = isDynamo(storeType)
            ? EvDbDynamoDbStorageAdapter.withOptions(dynamoDbOptions ?? {})
            : new EvDbPrismaStorageAdapter(storeClient);

        const sizes = sizesByDb[storeType] ?? defaultSizes;
        // DB adapters: fewer iterations (IO cost); DynamoDB reuses stepper to avoid cold init
        const reuseForStepper = isDynamo(storeType);

        for (const n of sizes) {
            const streamId = `bench-${storeType.toLowerCase()}-${n}-${Date.now()}`;

            console.log(`  Seeding ${n} events into ${storeType} …`);
            await seedRealDb(storeType, testManager, streamId, n);
            console.log(`  Seeding complete. Running scenarios …`);

            const iters = isDynamo(storeType) ? 2 : (n <= 1_000 ? 3 : n >= 100_000 ? 1 : 2);
            // DynamoDB LocalStack serialises requests; concurrent generators deadlock it.
            // Use concurrency=1 (sequential diff) so each replay is the only active I/O.
            const diffConcurrency = isDynamo(storeType) ? 1 : 4;

            await benchReplayThroughput(storageAdapter, storeType, streamId, n, iters);
            await benchStepperForward(storageAdapter, storeType, streamId, n, iters, reuseForStepper);
            await benchStepperBackward(storageAdapter, storeType, streamId, n, 50, iters, reuseForStepper);
            await benchConcurrentDiff(storageAdapter, storeType, streamId, n, diffConcurrency, iters);

            // Clean up to avoid data growth across iterations
            await Steps.clearEnvironment(storeClient, storeType, dynamoDbOptions);
        }

        await (storageAdapter as { close?: () => Promise<void> }).close?.();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║      EvDbTimeTraveler  Performance Benchmark     ║');
    console.log('╚══════════════════════════════════════════════════╝');

    // ── in-memory ──────────────────────────────────────────────────────────
    await runInMemorySuite();

    // ── real DBs (optional) ────────────────────────────────────────────────
    const testManager = new TestManager();
    const hasRealDbs = testManager.supportedDatabases.length > 0 &&
        process.env.TEST_CONTAINER === 'true';

    if (hasRealDbs) {
        console.log('\n▶  Starting test containers …');
        await testManager.start();
        try {
            await runRealDbSuite(testManager);
        } finally {
            console.log('\n▶  Stopping containers …');
            await testManager.stop();
        }
    } else {
        console.log('\n(Skipping real-DB suite — set TEST_CONTAINER=true to enable)');
    }

    printTable(results);
}

main().catch(err => { console.error(err); process.exit(1); });
