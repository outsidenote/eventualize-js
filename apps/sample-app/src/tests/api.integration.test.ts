//import * as assert from "node:assert";
import { test, describe, before, after } from "node:test";
import Steps from "./steps.js";
import Helpers from "./testHelpers.js";
import { EVENT_STORE_TYPE } from "./EVENT_STORE_TYPE.js";
import { TestManager } from "./TestContainerManager/TestManager.js";
import FundsPureEventsStreamFactory from "../eventstore/FundsStream/FundsPureEventsStreamFactory.js";
import type { DynamoDBClientOptions } from "./DynamoDBClientOptions.js";
import type { PrismaClient } from "@prisma/client/extension";
import * as assert from "node:assert";

// Start containers before all tests
describe("Database Integration Tests", () => {
  const testManager: TestManager = new TestManager();

  before(async () => {
    await testManager.start();
  });

  // Stop containers after all tests
  after(async () => {
    await testManager.stop();
  });

  test("start integration tests", async () => {
    const databasesToTest = testManager.supportedDatabases;
    for (const storeType of databasesToTest) {
      await test(`${storeType} execution`, async (t) => {
        const testData: { storeClient: DynamoDBClientOptions | PrismaClient | undefined } = {
          storeClient: undefined,
        };

        await t.before(async () => {
          const connectionConfig = testManager.getConnection(storeType);
          const dynamoDbOptions: DynamoDBClientOptions | undefined =
            testManager.getDynamoDbOptions();
          if (storeType !== EVENT_STORE_TYPE.DYNAMODB) {
            testData.storeClient = Steps.createStoreClient(
              storeType,
              connectionConfig as string | undefined,
            );
          } else {
            testData.storeClient = dynamoDbOptions;
          }
          await Steps.clearEnvironment(testData.storeClient, storeType, dynamoDbOptions);
        });

        await t.test("Store Events", async () => {
          const streamId = "api-points-stream";
          const storageAdapter = Helpers.createEventStore(storeType, testData.storeClient);
          const stream = await FundsPureEventsStreamFactory.get(streamId, storageAdapter);

          assert.strictEqual(
            stream.storedOffset,
            -1,
            "Stream offset should be 2 after storing events",
          );

          await stream.appendEventFundsDeposited({ amount: 100, Currency: "USD" });
          await stream.appendEventFundsCaptured({ amount: 20, Currency: "USD" });
          const affected = await stream.store();
          assert.strictEqual(affected.numEvents, 2, "Two events should have been stored");

          const stream1 = await FundsPureEventsStreamFactory.get(streamId, storageAdapter);
          assert.strictEqual(
            stream1.storedOffset,
            1,
            "Stream offset should be 2 after storing events",
          );
          assert.deepStrictEqual(
            stream1.getMessages(),
            [],
            "There should be no pending messages after storing events",
          );
          assert.deepStrictEqual(
            stream1.views,
            {},
            "There should be no views registered for this stream",
          );
        });

        // await t.test("When: stream stored and fetched", async () => {
        //   await assert.doesNotReject(testData.pointsStream.store());
        //   testData.fetchedStream = await testData.eventStore.getStream(
        //     "PointsStream",
        //     testData.streamId,
        //   );
        // });

        // await t.test("Then: fetched stream is correct", async () => {
        //   Steps.compareFetchedAndStoredStreams(testData.pointsStream, testData.fetchedStream);
        // });

        // await t.test("AND: Duplicate stream cannot be stored", async () => {
        //   testData.dupPointsStream = Steps.createPointsStream(
        //     testData.streamId,
        //     testData.eventStore,
        //   );
        //   Steps.addPointsEventsToStream(testData.dupPointsStream);
        //   await assert.rejects(testData.dupPointsStream.store(), {
        //     message: "OPTIMISTIC_CONCURRENCY_VIOLATION",
        //   });
        // });

        // await t.test("Race condition is handled correctly", async () => {
        //   testData.fetchedStream1 = await testData.eventStore.getStream(
        //     "PointsStream",
        //     testData.streamId,
        //   );
        //   testData.fetchedStream2 = await testData.eventStore.getStream(
        //     "PointsStream",
        //     testData.streamId,
        //   );
        //   Steps.addPointsEventsToStream(testData.fetchedStream1);
        //   Steps.addPointsEventsToStream(testData.fetchedStream2);
        //   const results = await Promise.allSettled([
        //     testData.fetchedStream1.store(),
        //     testData.fetchedStream2.store(),
        //   ]);
        //   assert.strictEqual(results.filter((r) => r.status === "fulfilled").length, 1);
        //   assert.strictEqual(results.filter((r) => r.status === "rejected").length, 1);
        // });

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
