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
import FundsFullEventsStreamFactory from "../eventstore/FundsStream/FundsFullEventsStreamFactory.js";

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

  test("start api.integration tests", async () => {
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

        // -----------------------------------------------------------------------

        await t.test("Pure: Events Only", async () => {
          const streamId = "api-pure-funds-stream";
          const storageAdapter = Helpers.createEventStore(storeType, testData.storeClient);
          const stream = await FundsPureEventsStreamFactory.get(streamId, storageAdapter);

          assert.strictEqual(
            stream.storedOffset,
            -1,
            "Stream offset should be 2 after storing events",
          );

          await stream.appendEventFundsDeposited({ amount: 100, currency: "USD" });
          await stream.appendEventFundsCaptured({ amount: 20, currency: "USD" });
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

        await t.test("Full: Events and Views", async () => {
          const streamId = "api-full-funds-stream";
          const storageAdapter = Helpers.createEventStore(storeType, testData.storeClient);
          const stream = await FundsFullEventsStreamFactory.get(streamId, storageAdapter);

          assert.strictEqual(
            stream.storedOffset,
            -1,
            "Stream offset should be 2 after storing events",
          );

          await stream.appendEventFundsDeposited({ amount: 100, currency: "USD" });
          await stream.appendEventFundsCaptured({ amount: 20, currency: "USD" });
          await stream.appendEventFundsWithdrawal({ amount: 10, currency: "USD" });
          const affected = await stream.store();
          assert.strictEqual(affected.numEvents, 3, "Three events should have been stored");
          assert.strictEqual(
            stream.views.balance,
            70,
            "Balance view should reflect the net effect of all events",
          );
          assert.strictEqual(
            stream.views["max-deposit"],
            100,
            "Max deposit view should reflect the largest deposit event",
          );
          assert.deepStrictEqual(
            stream.views["last-activity"],
            ["FundsDeposited", "FundsCaptured", "FundsWithdrawal"],
            "Last activity view should list the last 10 events in order",
          );
          await stream.appendEventFundsDeposited({ amount: 150, currency: "USD" });
          assert.strictEqual(
            stream.views["max-deposit"],
            150,
            "Max deposit view should reflect the largest deposit event",
          );
        });

        // -----------------------------------------------------------------------
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
