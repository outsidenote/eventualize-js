//import * as assert from "node:assert";
import { test, describe, before, after } from "node:test";
import Steps from "./steps.js";
import { EVENT_STORE_TYPE } from "./EVENT_STORE_TYPE.js";
import { TestManager } from "./TestContainerManager/TestManager.js";
import FundsStreamFactory from "../eventstore/FundsStream/FundsStreamFactory.js";
import type { DynamoDBClientOptions } from "./DynamoDBClientOptions.js";
import type { PrismaClient } from "@prisma/client/extension";

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
          if (storeType !== EVENT_STORE_TYPE.DYNAMODB) {
            testData.storeClient = Steps.createStoreClient(
              storeType,
              connectionConfig as string | undefined,
            );
          }
          const dynamoDbOptions: DynamoDBClientOptions | undefined =
            testManager.getDynamoDbOptions();
          // testData.eventStore = Steps.createEventStore(
          //   testData.storeClient,
          //   storeType,
          //   dynamoDbOptions,
          // );
          await Steps.clearEnvironment(testData.storeClient, storeType, dynamoDbOptions);
        });

        await t.test("Store Events", async () => {
          const streamId = "api-points-stream";
          const stream = await FundsStreamFactory.get(streamId, testData.storeClient);
          await stream.appendEventFundsDeposited({ amount: 100, currency: "USD" } );
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
