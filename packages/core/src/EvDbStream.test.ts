import { test, describe } from "node:test";
import * as assert from "node:assert";

describe("EvDbStream", () => {
  test("module can be imported", async () => {
    const module = await import("./store/EvDbStream.js");
    assert.ok(module.default, "EvDbStream should be exported as default");
  });
});

describe("EvDbView", () => {
  test("module can be imported", async () => {
    const module = await import("./view/EvDbView.js");
    assert.ok(module.EvDbView, "EvDbView should be exported");
  });
});
