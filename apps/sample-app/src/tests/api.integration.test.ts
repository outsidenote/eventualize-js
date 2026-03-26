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
import FundsEventsAndViewsStreamFactory from "../eventstore/FundsStream/FundsEventsAndViewsStreamFactory.js";

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


  test("start api pure events integration tests", async () => {
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
          assert.deepStrictEqual(stream.views, {}, "There should be no views in pure events stream");
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
        });

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

  test("start api events and views integration tests", async () => {
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
          const stream = await FundsEventsAndViewsStreamFactory.get(streamId, storageAdapter, storageAdapter);

          assert.strictEqual(
            stream.storedOffset,
            -1,
            "Stream offset should be 2 after storing events",
          );

          await stream.appendEventFundsDeposited({ amount: 100, Currency: "USD" });
          await stream.appendEventFundsCaptured({ amount: 20, Currency: "USD" });
          assert.strictEqual(stream.views.balance, 80, "Balance should be 80 after storing events");
          const affected = await stream.store();
          assert.strictEqual(affected.numEvents, 2, "Two events should have been stored");

          const stream1 = await FundsEventsAndViewsStreamFactory.get(streamId, storageAdapter, storageAdapter);
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
          assert.strictEqual(
            stream1.views.balance,
            80,
            "Balance should be 80 after reloading stream",
          );
        });

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

  test("start api messages integration tests", async () => {
    const databasesToTest = testManager.supportedDatabases;
    for (const storeType of databasesToTest) {
      await test(`${storeType} messages execution`, async (t) => {
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

        await t.test("Messages produced by withMessages", async () => {
          const streamId = "api-messages-stream";
          const storageAdapter = Helpers.createEventStore(storeType, testData.storeClient);
          const stream = await FundsEventsAndViewsStreamFactory.get(streamId, storageAdapter, storageAdapter);

          // FundsDeposited has no withMessages producer — no messages expected
          await stream.appendEventFundsDeposited({ amount: 100, Currency: "USD" });
          assert.strictEqual(
            stream.getMessages().length,
            0,
            "No messages should be produced for FundsDeposited",
          );

          // FundsCaptured has a withMessages producer — 1 message expected
          await stream.appendEventFundsCaptured({ amount: 20, Currency: "USD" });
          const messages = stream.getMessages();
          assert.strictEqual(messages.length, 1, "One message should be produced for FundsCaptured");

          const msg = messages[0];
          assert.strictEqual(
            msg.messageType,
            "Funds Captured with Balance Notification",
            "Message type should match",
          );
          assert.strictEqual(msg.payload!.amountCaptured, 20, "amountCaptured should be 20");
          assert.strictEqual(
            msg.payload!.balanceAfterCapture,
            80,
            "balanceAfterCapture should be 80 (100 deposited - 20 captured)",
          );
          assert.strictEqual(msg.eventType, "FundsCaptured", "eventType should be FundsCaptured");
          assert.strictEqual(msg.channel, "default", "channel should be default");

          // After store, pending messages should be cleared
          await stream.store();
          assert.strictEqual(
            stream.getMessages().length,
            0,
            "Pending messages should be cleared after store",
          );

          // Reloaded stream should have no pending messages
          const stream1 = await FundsEventsAndViewsStreamFactory.get(streamId, storageAdapter, storageAdapter);
          assert.strictEqual(
            stream1.getMessages().length,
            0,
            "Reloaded stream should have no pending messages",
          );
        });

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
