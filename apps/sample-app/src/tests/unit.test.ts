import * as _assert from "node:assert";
import { test, describe } from "node:test"; // Use require or import
import Steps from "./steps.js";
import { EVENT_STORE_TYPE } from "./EVENT_STORE_TYPE.js";
import type { PointsStreamType } from "../eventstore/PointsStream/PointsStreamFactory.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

type StoreClientType = ReturnType<typeof Steps.createStoreClient>;

interface UnitTestData {
  client?: StoreClientType;
  storageAdapter?: IEvDbStorageAdapter;
  pointsStream?: PointsStreamType;
}

describe("Unit Tests", () => {
  test("Add events to empty stream", async (t) => {
    const testData: UnitTestData = {};
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
      Steps.addPointsEventsToStream(testData.pointsStream!);
    });

    t.test("Then: stream applies events correctly", () => {
      Steps.assertStreamStateIsCorrect(testData.pointsStream!);
    });
  });
});
