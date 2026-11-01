import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type { EvDbSnapshotBody } from "@eventualize/types/snapshots/EvDbSnapshotBody";
import InMemoryStorageAdapter from "../store/InMemoryStorageAdapter.test-support.js";
import { createViewFactory } from "../factories/EvDbViewFactory.js";
import type { EvDbStreamEventHandlersMap } from "../factories/EvDbViewFactory.js";
import { createSnapshotStrategy } from "./EvDbSnapshotStrategyBuilder.js";
import type { EvDbSnapshotStrategy } from "./EvDbSnapshotStrategyBuilder.js";

type Events = { Touch: { n: number } };
type State = { sum: number };

class RecordingAdapter extends InMemoryStorageAdapter {
  public bodies: EvDbSnapshotBody[] = [];

  override async storeSnapshotAsync(data: EvDbStoredSnapshotData): Promise<void> {
    await super.storeSnapshotAsync(data);
    this.bodies.push(data.body);
  }
}

const streamAddress = new EvDbStreamAddress("S", "s-1");
const touch = (offset: number): EvDbEvent =>
  new EvDbEvent("Touch", new EvDbStreamCursor(streamAddress, offset), { n: 1 });

function factory(
  handlers: Partial<EvDbStreamEventHandlersMap<State, Events>>,
  snapshotStrategy?: EvDbSnapshotStrategy<State>,
) {
  return createViewFactory<State, Events>({
    viewName: "V",
    streamType: "S",
    defaultState: { sum: 0 },
    handlers,
    snapshotStrategy,
  });
}

const sameRef: Partial<EvDbStreamEventHandlersMap<State, Events>> = { Touch: (s) => s };
const newObject: Partial<EvDbStreamEventHandlersMap<State, Events>> = {
  Touch: (s, e) => ({ sum: s.sum + e.n }),
};
const mutate: Partial<EvDbStreamEventHandlersMap<State, Events>> = {
  Touch: (s, e) => {
    (s as State).sum += e.n;
    return s;
  },
};
const trusted = () => createSnapshotStrategy<State, Events>((s) => s.changeDetection("trusted"));

describe("EvDbView change detection", () => {
  test("Given the default mode, When a handler returns the same reference, Then the next store writes a full row", async () => {
    const adapter = new RecordingAdapter();
    const view = factory(sameRef).create("s-1", adapter);
    view.applyEvent(touch(1));
    await view.store();
    assert.deepStrictEqual(adapter.bodies, [{ kind: "full", state: { sum: 0 } }]);
  });

  test("Given trusted mode, When a handler returns the same reference, Then the next store writes a pointer row", async () => {
    const adapter = new RecordingAdapter();
    const view = factory(sameRef, trusted()).create("s-1", adapter);
    view.applyEvent(touch(1));
    await view.store();
    assert.deepStrictEqual(adapter.bodies, [{ kind: "pointer", stateRef: { kind: "default" } }]);
  });

  test("Given trusted mode, When a handler returns a new object, Then the next store writes a full row", async () => {
    const adapter = new RecordingAdapter();
    const view = factory(newObject, trusted()).create("s-1", adapter);
    view.applyEvent(touch(1));
    await view.store();
    assert.deepStrictEqual(adapter.bodies, [{ kind: "full", state: { sum: 1 } }]);
  });

  test("Given trusted mode, When a handler mutates in place and returns the same reference, Then a pointer row is written (known risk of trusted mode)", async () => {
    const adapter = new RecordingAdapter();
    const view = factory(mutate, trusted()).create("s-1", adapter);
    view.applyEvent(touch(1));
    await view.store();
    assert.deepStrictEqual(adapter.bodies, [{ kind: "pointer", stateRef: { kind: "default" } }]);
  });

  test("Given a strategy that only calls changeDetection('trusted'), When a changed view stores, Then a full row is written on every store", async () => {
    const adapter = new RecordingAdapter();
    const view = factory(newObject, trusted()).create("s-1", adapter);
    view.applyEvent(touch(1));
    await view.store();
    view.applyEvent(touch(2));
    await view.store();
    assert.deepStrictEqual(adapter.bodies, [
      { kind: "full", state: { sum: 1 } },
      { kind: "full", state: { sum: 2 } },
    ]);
  });
});
