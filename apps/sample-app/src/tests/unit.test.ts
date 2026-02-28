import * as _assert from "node:assert";
import { test, describe } from "node:test"; // Use require or import
import Steps from "./steps.js";
import { EVENT_STORE_TYPE } from "./EVENT_STORE_TYPE.js";

describe("Unit Tests", () => {
  test("Add events to empty stream", async (t) => {
    const testData: any = {};
    t.test("Given: empty stream", () => {
      testData.client = Steps.createStoreClient(EVENT_STORE_TYPE.STUB);
      testData.storageAdapter = Steps.createStorageAdapter(
        EVENT_STORE_TYPE.STUB,
        testData.client,
        undefined,
      );
      testData.pointsStream = Steps.createPointsStream("pointsStream1", testData.storageAdapter);
    });

    t.test("When: new events added to stream", () => {
      Steps.addPointsEventsToStream(testData.pointsStream);
    });

    t.test("Then: stream applies events correctly", () => {
      Steps.assertStreamStateIsCorrect(testData.pointsStream);
    });
  });
});
