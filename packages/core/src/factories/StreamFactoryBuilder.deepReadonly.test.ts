import { test, describe } from "node:test";
import assert from "node:assert";
import DeepReadonlyStreamFactory from "./deep-readonly-test/DeepReadonlyStreamFactory.test-support.js";

// The type checks live in DeepReadonlyStreamFactory.test-support.ts (@ts-expect-error).
describe("DeepReadonly view state", () => {
  test("Given handlers that copy their state, When the factory is built, Then it exists", () => {
    assert.ok(DeepReadonlyStreamFactory);
  });
});
