import * as assert from "node:assert";
import { test, describe, before, after } from "node:test";
import Steps from "./steps.js";
import { EVENT_STORE_TYPE } from "./EVENT_STORE_TYPE.js";
import { TestManager } from "./TestContainerManager/TestManager.js";
import PointsStreamFactory from "../eventstore/PointsStream/PointsStreamFactory.js";
import type { PointsStreamType } from "../eventstore/PointsStream/PointsStreamFactory.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbCloneError from "@eventualize/core/store/EvDbCloneError";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import { context, propagation, trace } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

type StoreClientType = ReturnType<typeof Steps.createStoreClient>;

interface IntegrationTestData {
  storeClient?: StoreClientType;
  storageAdapter?: IEvDbStorageAdapter;
  streamId?: string;
  pointsStream?: PointsStreamType;
  fetchedStream?: PointsStreamType;
  dupPointsStream?: PointsStreamType;
  fetchedStream1?: PointsStreamType;
  fetchedStream2?: PointsStreamType;
}

// Start containers before all tests
describe("Database Integration Tests", () => {
  const testManager: TestManager = new TestManager();
  // Registers the W3C propagator and an async context manager, so events
  // capture the active span's trace context.
  const tracerProvider = new NodeTracerProvider();

  before(async () => {
    tracerProvider.register();
    await testManager.start();
  });

  // Stop containers after all tests
  after(async () => {
    await testManager.stop();
    await tracerProvider.shutdown();
  });

  test("start integration tests", async () => {
    const databasesToTest = testManager.supportedDatabases;
    for (const storeType of databasesToTest) {
      await test(`${storeType} execution`, async (t) => {
        const testData: IntegrationTestData = {};

        await t.before(async () => {
          const connectionConfig = testManager.getConnection(storeType);
          const dynamoDbOptions = testManager.getDynamoDbOptions();
          if (storeType !== EVENT_STORE_TYPE.DYNAMODB) {
            testData.storeClient = Steps.createStoreClient(
              storeType,
              connectionConfig as string | undefined,
            );
          }
          testData.storageAdapter = Steps.createStorageAdapter(
            storeType,
            testData.storeClient,
            dynamoDbOptions,
          );
          await Steps.clearEnvironment(testData.storeClient, storeType, dynamoDbOptions);
        });

        await t.test("Given: local stream with events", () => {
          testData.streamId = "pointsStream1";
          testData.pointsStream = Steps.createPointsStream(
            testData.streamId,
            testData.storageAdapter!,
          );
          Steps.addPointsEventsToStream(testData.pointsStream);
          Steps.assertStreamStateIsCorrect(testData.pointsStream);
        });

        await t.test("When: stream stored and fetched", async () => {
          await assert.doesNotReject(testData.pointsStream!.store());
          testData.fetchedStream = await PointsStreamFactory.get(
            testData.streamId!,
            testData.storageAdapter!,
            testData.storageAdapter!,
          );
        });

        await t.test("Then: fetched stream is correct", async () => {
          Steps.compareFetchedAndStoredStreams(testData.pointsStream!, testData.fetchedStream!);
        });

        await t.test("AND: Duplicate stream cannot be stored", async () => {
          testData.dupPointsStream = Steps.createPointsStream(
            testData.streamId!,
            testData.storageAdapter!,
          );
          Steps.addPointsEventsToStream(testData.dupPointsStream);
          await assert.rejects(testData.dupPointsStream.store(), {
            message: "OPTIMISTIC_CONCURRENCY_VIOLATION",
          });
        });

        await t.test("Race condition is handled correctly", async () => {
          testData.fetchedStream1 = await PointsStreamFactory.get(
            testData.streamId!,
            testData.storageAdapter!,
            testData.storageAdapter!,
          );
          testData.fetchedStream2 = await PointsStreamFactory.get(
            testData.streamId!,
            testData.storageAdapter!,
            testData.storageAdapter!,
          );
          Steps.addPointsEventsToStream(testData.fetchedStream1);
          Steps.addPointsEventsToStream(testData.fetchedStream2);
          const results = await Promise.allSettled([
            testData.fetchedStream1.store(),
            testData.fetchedStream2.store(),
          ]);
          assert.strictEqual(results.filter((r) => r.status === "fulfilled").length, 1);
          assert.strictEqual(results.filter((r) => r.status === "rejected").length, 1);
        });

        await t.test("AND: trace context is stored and fetched with events", async (t) => {
          if (storeType === EVENT_STORE_TYPE.DYNAMODB) {
            t.skip("DynamoDB adapter does not persist event trace context");
            return;
          }
          const streamId = "pointsStreamTraced";
          const span = trace.getTracer("integration-test").startSpan("store-traced-stream");
          const spanContext = trace.setSpan(context.active(), span);
          const carrier: Record<string, string> = {};
          propagation.inject(spanContext, carrier);
          const expectedTraceparent = carrier["traceparent"];
          assert.ok(expectedTraceparent, "active span should produce a traceparent");

          const stream = Steps.createPointsStream(streamId, testData.storageAdapter!);
          await context.with(spanContext, async () => {
            Steps.addPointsEventsToStream(stream);
            await stream.store();
          });
          span.end();

          const fetched: EvDbEvent[] = [];
          const cursor = new EvDbStreamCursor("PointsStream", streamId, 0);
          for await (const event of testData.storageAdapter!.getEventsAsync(cursor)) {
            fetched.push(event);
          }
          assert.strictEqual(fetched.length, 11);
          for (const event of fetched) {
            assert.strictEqual(event.traceparent, expectedTraceparent);
          }
        });

        await t.test("Paging: stream with two stored batches", async () => {
          // Batch 1 → offsets 1..11 (create() starts at offset 1), snapshots at 11.
          const first = Steps.createPointsStream("pointsPaging", testData.storageAdapter!);
          Steps.addPointsEventsToStream(first);
          await first.store();
          // Batch 2 → offsets 12..22, snapshots at 22.
          const second = await PointsStreamFactory.get(
            "pointsPaging",
            testData.storageAdapter!,
            testData.storageAdapter!,
          );
          Steps.addPointsEventsToStream(second);
          await second.store();
          assert.strictEqual(second.storedOffset, 22);
        });

        await t.test(
          "Paging: getEventsAsync with small pageSize yields each event once",
          async () => {
            const cursor = new EvDbStreamCursor("PointsStream", "pointsPaging", 0);
            const offsets: number[] = [];
            let firstEvent: EvDbEvent | undefined;
            for await (const event of testData.storageAdapter!.getEventsAsync(cursor, 3)) {
              firstEvent ??= event;
              offsets.push(event.streamCursor.offset);
            }
            assert.deepStrictEqual(
              offsets,
              Array.from({ length: 22 }, (_, i) => i + 1),
            );
            // Offset 1 is appendEventPointsAdded({ points: 50 }): the payload is yielded
            // exactly as stored, not wrapped as { eventType, payload }.
            assert.ok(firstEvent !== undefined);
            assert.strictEqual(firstEvent.eventType, "PointsAdded");
            assert.deepStrictEqual(firstEvent.payload, { points: 50 });
          },
        );

        await t.test("Paging: getEventsAsync starts at the cursor offset", async () => {
          const cursor = new EvDbStreamCursor("PointsStream", "pointsPaging", 20);
          const offsets: number[] = [];
          for await (const event of testData.storageAdapter!.getEventsAsync(cursor, 3)) {
            offsets.push(event.streamCursor.offset);
          }
          assert.deepStrictEqual(offsets, [20, 21, 22]);
        });

        await t.test("Snapshots: getSnapshotAsync honours maxOffset", async () => {
          const viewAddress = new EvDbViewAddress(
            new EvDbStreamAddress("PointsStream", "pointsPaging"),
            "Sum",
          );
          const latest = await testData.storageAdapter!.getSnapshotAsync(viewAddress);
          assert.strictEqual(latest.offset, 22);

          const atOrBefore15 = await testData.storageAdapter!.getSnapshotAsync(viewAddress, 15);
          assert.strictEqual(atOrBefore15.offset, 11);
          assert.deepStrictEqual(atOrBefore15.state, { sum: 210 });

          const exact = await testData.storageAdapter!.getSnapshotAsync(viewAddress, 11);
          assert.strictEqual(exact.offset, 11);

          const none = await testData.storageAdapter!.getSnapshotAsync(viewAddress, 5);
          assert.strictEqual(none.offset, -1);
        });

        await t.test("Replay: goToOffset between two snapshots", async () => {
          const s = await PointsStreamFactory.goToOffset(
            "pointsPaging",
            15,
            testData.storageAdapter!,
            testData.storageAdapter!,
          );
          assert.strictEqual(s.event.streamCursor.offset, 15);
          assert.strictEqual(s.views.Sum.sum, 270);
          assert.strictEqual(s.views.Count.count, 15);
          assert.strictEqual(s.isHead, false);
        });

        await t.test("Replay: messages are recomputed for the current event", async () => {
          // offset 14 is PointsAdded → two notifications
          const s = await PointsStreamFactory.goToOffset(
            "pointsPaging",
            14,
            testData.storageAdapter!,
            testData.storageAdapter!,
          );
          assert.strictEqual(s.event.eventType, "PointsAdded");
          assert.strictEqual(s.messages.length, 2);
        });

        await t.test("Replay: forward to the head with pageSize 3", async () => {
          const s = await PointsStreamFactory.goToOffset(
            "pointsPaging",
            1,
            testData.storageAdapter!,
            testData.storageAdapter!,
            3,
          );
          const seen = [s.event.streamCursor.offset];
          while (!s.isHead) {
            await s.forward();
            seen.push(s.event.streamCursor.offset);
          }
          assert.deepStrictEqual(
            seen,
            Array.from({ length: 22 }, (_, i) => i + 1),
          );
          assert.strictEqual(s.views.Sum.sum, 630);
          assert.strictEqual(s.views.Count.count, 22);
        });

        await t.test("Replay: offset 0 does not exist for create()-based streams", async () => {
          await assert.rejects(
            PointsStreamFactory.goToOffset(
              "pointsPaging",
              0,
              testData.storageAdapter!,
              testData.storageAdapter!,
            ),
            RangeError,
          );
        });

        await t.test("Clone: offsetLimit 15, dropping PointsMultiplied", async () => {
          const target = await PointsStreamFactory.clone(
            "pointsPaging",
            "pointsPagingClone",
            testData.storageAdapter!,
            testData.storageAdapter!,
            {
              offsetLimit: 15,
              projectEvent: (e) => (e.eventType === "PointsMultiplied" ? undefined : e),
            },
          );
          assert.strictEqual(target.views.Sum.sum, 210);
          assert.strictEqual(target.views.Count.count, 14);

          const source: EvDbEvent[] = [];
          for await (const e of testData.storageAdapter!.getEventsAsync(
            new EvDbStreamCursor("PointsStream", "pointsPaging", 0),
          )) {
            if (e.streamCursor.offset <= 15 && e.eventType !== "PointsMultiplied") source.push(e);
          }
          const cloned: EvDbEvent[] = [];
          for await (const e of testData.storageAdapter!.getEventsAsync(
            new EvDbStreamCursor("PointsStream", "pointsPagingClone", 0),
          )) {
            cloned.push(e);
          }
          assert.deepStrictEqual(
            cloned.map((e) => e.streamCursor.offset),
            Array.from({ length: 14 }, (_, i) => i),
          );
          assert.deepStrictEqual(
            cloned.map((e) => e.eventType),
            source.map((e) => e.eventType),
          );
          assert.deepStrictEqual(
            cloned.map((e) => e.capturedAt.getTime()),
            source.map((e) => e.capturedAt.getTime()),
          );
        });

        await t.test("Clone: a non-empty target throws EvDbCloneError", async () => {
          await assert.rejects(
            PointsStreamFactory.clone(
              "pointsPaging",
              "pointsPagingClone",
              testData.storageAdapter!,
              testData.storageAdapter!,
            ),
            EvDbCloneError,
          );
        });

        await t.test(
          "Clone: events and messages are batched to stay under the DynamoDB item limit",
          async () => {
            // 2 batches of 20 PointsAdded events (2 messages each): 60 items per store.
            const first = Steps.createPointsStream("pointsMessages", testData.storageAdapter!);
            for (let i = 0; i < 20; i++) await first.appendEventPointsAdded({ points: 1 });
            await first.store();
            const second = await PointsStreamFactory.get(
              "pointsMessages",
              testData.storageAdapter!,
              testData.storageAdapter!,
            );
            for (let i = 0; i < 20; i++) await second.appendEventPointsAdded({ points: 1 });
            await second.store();

            // 40 events + 80 messages = 120 items: more than one DynamoDB transaction holds.
            const target = await PointsStreamFactory.clone(
              "pointsMessages",
              "pointsMessagesClone",
              testData.storageAdapter!,
              testData.storageAdapter!,
              { projectMessage: (m) => m },
            );
            assert.strictEqual(target.views.Count.count, 40);
            assert.strictEqual(target.views.Sum.sum, 40);
          },
        );

        t.after(async () => {
          await Steps.clearEnvironment(
            testData.storeClient,
            storeType,
            testManager.getDynamoDbOptions(),
          );
        });
      });
    }
  });
});
