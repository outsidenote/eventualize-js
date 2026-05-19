import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";

import { handlers } from "./handlers.js";
import { defaultState, viewName } from "./state.js";

const meta: IEvDbEventMetadata = {
  streamCursor: new EvDbStreamCursor("funds-stream", "test", 0),
  eventType: "",
  capturedAt: new Date(),
  capturedBy: "test",
};

describe(`View: ${viewName}`, () => {
  test("FundsDeposited increases balance", () => {
    const s = handlers.FundsDeposited(defaultState, { accountId: "a1", amount: 100, currency: "USD" }, meta);
    assert.strictEqual(s, 100);
  });

  test("FundsWithdrawn decreases balance", () => {
    const s0 = handlers.FundsDeposited(defaultState, { accountId: "a1", amount: 200, currency: "USD" }, meta);
    const s1 = handlers.FundsWithdrawn(s0, { accountId: "a1", amount: 75, currency: "USD" }, meta);
    assert.strictEqual(s1, 125);
  });

  test("balance tracks raw delta even below zero", () => {
    const s = handlers.FundsWithdrawn(defaultState, { accountId: "a1", amount: 50, currency: "USD" }, meta);
    assert.strictEqual(s, -50);
  });
});
