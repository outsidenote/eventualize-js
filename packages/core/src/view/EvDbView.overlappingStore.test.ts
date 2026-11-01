import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type { EvDbSnapshotBody } from "@eventualize/types/snapshots/EvDbSnapshotBody";
import InMemoryStorageAdapter from "../store/InMemoryStorageAdapter.test-support.js";
import { createViewFactory } from "../factories/EvDbViewFactory.js";

type Events = { Added: { points: number }; Noop: { x: number } };
type State = { sum: number };

/** Delays or fails the write for chosen offsets, and records the writes that succeed. */
class ControlledAdapter extends InMemoryStorageAdapter {
  public readonly delays = new Map<number, number>();
  public readonly failOffsets = new Set<number>();
  public readonly writes: { offset: number; body: EvDbSnapshotBody }[] = [];

  override async storeSnapshotAsync(data: EvDbStoredSnapshotData): Promise<void> {
    const delay = this.delays.get(data.offset) ?? 0;
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (this.failOffsets.has(data.offset)) {
      throw new Error(`store failed at ${data.offset}`);
    }
    await super.storeSnapshotAsync(data);
    this.writes.push({ offset: data.offset, body: data.body });
  }
}

const streamAddress = new EvDbStreamAddress("S", "s-1");
const added = (offset: number): EvDbEvent =>
  new EvDbEvent("Added", new EvDbStreamCursor(streamAddress, offset), { points: 1 });
const noop = (offset: number): EvDbEvent =>
  new EvDbEvent("Noop", new EvDbStreamCursor(streamAddress, offset), { x: 1 });

const viewFactory = createViewFactory<State, Events>({
  viewName: "V",
  streamType: "S",
  defaultState: { sum: 0 },
  handlers: { Added: (s, e) => ({ sum: s.sum + e.points }) },
});

describe("EvDbView overlapping store", () => {
  test("Given a slow full write at 1 and a fast full write at 2 started before it ends, When a no-handler event is stored at 3, Then the pointer names row 2 and a reload returns the state of offset 2", async () => {
    const adapter = new ControlledAdapter();
    const view = viewFactory.create("s-1", adapter);
    adapter.delays.set(1, 50);

    view.applyEvent(added(1));
    const first = view.store();
    view.applyEvent(added(2));
    const second = view.store();
    await Promise.all([first, second]);

    view.applyEvent(noop(3));
    await view.store();

    assert.deepStrictEqual(view.stateRef, { kind: "row", offset: 2 });
    const reloaded = await viewFactory.get("s-1", adapter);
    assert.strictEqual(reloaded.state.sum, 2);
  });

  test("Given two overlapping stores, When both run, Then the adapter never gets an older offset after a newer one", async () => {
    const adapter = new ControlledAdapter();
    const view = viewFactory.create("s-1", adapter);
    adapter.delays.set(1, 50);

    view.applyEvent(added(1));
    const first = view.store();
    view.applyEvent(added(2));
    const second = view.store();
    await Promise.all([first, second]);

    const offsets = adapter.writes.map((w) => w.offset);
    assert.deepStrictEqual(
      offsets,
      [...offsets].sort((a, b) => a - b),
    );
    assert.strictEqual(offsets[offsets.length - 1], 2);
    assert.strictEqual(view.storeOffset, 2);
  });

  test("Given a store that rejects, When the next store is queued behind it, Then the caller gets the rejection and the next store still writes", async () => {
    const adapter = new ControlledAdapter();
    const view = viewFactory.create("s-1", adapter);
    adapter.delays.set(1, 20);
    adapter.failOffsets.add(1);

    view.applyEvent(added(1));
    const failing = view.store();
    const next = view.store();

    await assert.rejects(failing, /store failed at 1/);
    // The failed store left the view dirty with storeOffset unchanged, so the queued store retries offset 1.
    adapter.failOffsets.clear();
    await next;

    assert.deepStrictEqual(adapter.writes, [
      { offset: 1, body: { kind: "full", state: { sum: 1 } } },
    ]);
    assert.strictEqual(view.storeOffset, 1);
    assert.deepStrictEqual(view.stateRef, { kind: "row", offset: 1 });
  });

  test("Given a store that rejected, When store is called again later, Then it writes the row", async () => {
    const adapter = new ControlledAdapter();
    const view = viewFactory.create("s-1", adapter);
    adapter.failOffsets.add(1);

    view.applyEvent(added(1));
    await assert.rejects(view.store(), /store failed at 1/);
    assert.strictEqual(view.storeOffset, -1);

    adapter.failOffsets.clear();
    await view.store();
    assert.strictEqual(view.storeOffset, 1);
    assert.deepStrictEqual(view.stateRef, { kind: "row", offset: 1 });
  });

  test("Given a view whose onApplyEvent returns undefined (a JS subclass), When an event is applied and stored, Then a full row is written", async () => {
    const adapter = new ControlledAdapter();
    const view = viewFactory.create("s-1", adapter);
    // Simulates a plain-JS override that applies the event and returns nothing.
    Object.defineProperty(view, "onApplyEvent", { value: () => undefined });

    view.applyEvent(added(1));
    await view.store();

    assert.deepStrictEqual(
      adapter.writes.map((w) => w.body.kind),
      ["full"],
    );
  });
  test("Given a settled store at 2, When event 3 is applied and stored, Then the row at offset 3 holds the state that includes event 3", async () => {
    const adapter = new ControlledAdapter();
    const view = viewFactory.create("s-1", adapter);

    view.applyEvent(added(1));
    view.applyEvent(added(2));
    await view.store();
    view.applyEvent(added(3));
    await view.store();

    assert.deepStrictEqual(adapter.writes, [
      { offset: 2, body: { kind: "full", state: { sum: 2 } } },
      { offset: 3, body: { kind: "full", state: { sum: 3 } } },
    ]);
    assert.deepStrictEqual(view.stateRef, { kind: "row", offset: 3 });
    const reloaded = await viewFactory.get("s-1", adapter);
    assert.strictEqual(reloaded.storeOffset, 3);
    assert.strictEqual(reloaded.state.sum, 3);
  });

  test("Given a settled store at 1, When events 2 and 3 are applied and one store runs, Then the row offset is 3 and its state has both events", async () => {
    const adapter = new ControlledAdapter();
    const view = viewFactory.create("s-1", adapter);

    view.applyEvent(added(1));
    await view.store();
    view.applyEvent(added(2));
    view.applyEvent(added(3));
    await view.store();

    const last = adapter.writes[adapter.writes.length - 1];
    assert.deepStrictEqual(last, { offset: 3, body: { kind: "full", state: { sum: 3 } } });
  });

  test("Given an event applied while a slow store is in flight, When a second store runs, Then a reload equals a full replay", async () => {
    const adapter = new ControlledAdapter();
    const view = viewFactory.create("s-1", adapter);
    adapter.delays.set(1, 50);

    view.applyEvent(added(1));
    const first = view.store();
    view.applyEvent(added(2));
    const second = view.store();
    await Promise.all([first, second]);

    const reloaded = await viewFactory.get("s-1", adapter);
    const replayed = viewFactory.create("s-1", new ControlledAdapter());
    replayed.applyEvent(added(1));
    replayed.applyEvent(added(2));
    assert.strictEqual(reloaded.storeOffset, 2);
    assert.deepStrictEqual(reloaded.state, replayed.state);
  });
});
