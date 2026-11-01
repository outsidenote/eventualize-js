import { describe, test } from "node:test";
import assert from "node:assert/strict";
import EvDbStreamAddress from "../stream/EvDbStreamAddress.js";
import EvDbViewAddress from "../view/EvDbViewAddress.js";
import { EvDbStoredSnapshotData } from "./EvDbStoredSnapshotData.js";
import { EvDbStoredSnapshotResultRaw } from "./EvDbStoredSnapshotResultRaw.js";

const address = new EvDbViewAddress(new EvDbStreamAddress("type", "id"), "view");

describe("EvDbStoredSnapshotData", () => {
  test("Given a full body, When fromAddress is called, Then body.kind is full and body.state is the state", () => {
    const data = EvDbStoredSnapshotData.fromAddress(address, 3, 3, {
      kind: "full",
      state: { sum: 3 },
    });
    assert.deepStrictEqual(data.body, { kind: "full", state: { sum: 3 } });
  });

  test("Given a pointer body to row 5, When fromAddress is called, Then body is a pointer to row 5", () => {
    const data = EvDbStoredSnapshotData.fromAddress(address, 7, 7, {
      kind: "pointer",
      stateRef: { kind: "row", offset: 5 },
    });
    assert.deepStrictEqual(data.body, {
      kind: "pointer",
      stateRef: { kind: "row", offset: 5 },
    });
  });
});

describe("EvDbStoredSnapshotResultRaw", () => {
  test("Given Empty, Then stateRef is default and offset is -1", () => {
    assert.deepStrictEqual(EvDbStoredSnapshotResultRaw.Empty.stateRef, { kind: "default" });
    assert.strictEqual(EvDbStoredSnapshotResultRaw.Empty.offset, -1);
  });
});
