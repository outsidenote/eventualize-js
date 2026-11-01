import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type { EvDbSnapshotBody } from "@eventualize/types/snapshots/EvDbSnapshotBody";
import InMemoryStorageAdapter from "../store/InMemoryStorageAdapter.test-support.js";
import { EvDbView } from "./EvDbView.js";
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import { EvDbStoredSnapshotResult } from "@eventualize/types/snapshots/EvDbStoredSnapshotResult";
import { createViewFactory } from "../factories/EvDbViewFactory.js";
import type { EvDbStreamEventHandlersMap } from "../factories/EvDbViewFactory.js";
import { createSnapshotStrategy } from "./EvDbSnapshotStrategyBuilder.js";
import type {
  EvDbSnapshotStrategy,
  EvDbSnapshotStrategyBuilder,
} from "./EvDbSnapshotStrategyBuilder.js";

type Events = { Added: { points: number }; Closed: { reason: string } };
type State = { sum: number; closed: boolean };

interface Write {
  readonly offset: number;
  readonly body: EvDbSnapshotBody;
}

class RecordingAdapter extends InMemoryStorageAdapter {
  public writes: Write[] = [];
  public failNext = false;

  override async storeSnapshotAsync(data: EvDbStoredSnapshotData): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("store failed");
    }
    await super.storeSnapshotAsync(data);
    this.writes.push({ offset: data.offset, body: data.body });
  }
}

const streamAddress = new EvDbStreamAddress("S", "s-1");
const viewAddress = new EvDbViewAddress(streamAddress, "V");
const added = (offset: number, points = 1): EvDbEvent =>
  new EvDbEvent("Added", new EvDbStreamCursor(streamAddress, offset), { points });
const closed = (offset: number): EvDbEvent =>
  new EvDbEvent("Closed", new EvDbStreamCursor(streamAddress, offset), { reason: "done" });

const allHandlers: Partial<EvDbStreamEventHandlersMap<State, Events>> = {
  Added: (s, e) => ({ ...s, sum: s.sum + e.points }),
  Closed: (s) => ({ ...s, closed: true }),
};
const closedOnly: Partial<EvDbStreamEventHandlersMap<State, Events>> = {
  Closed: (s) => ({ ...s, closed: true }),
};

function factory(
  handlers: Partial<EvDbStreamEventHandlersMap<State, Events>>,
  snapshotStrategy?: EvDbSnapshotStrategy<State>,
) {
  return createViewFactory<State, Events>({
    viewName: "V",
    streamType: "S",
    defaultState: { sum: 0, closed: false },
    handlers,
    snapshotStrategy,
  });
}

const pointer = (offset: number, ref: { kind: "row"; offset: number } | { kind: "default" }) => ({
  offset,
  body: { kind: "pointer", stateRef: ref },
});

describe("EvDbView pointer rows", () => {
  test("Given a view with a handler only for Closed, When three Added events are stored one by one, Then each store writes a pointer row whose stateRef is { kind: 'default' }", async () => {
    const adapter = new RecordingAdapter();
    const view = factory(closedOnly).create("s-1", adapter);
    for (const o of [1, 2, 3]) {
      view.applyEvent(added(o));
      await view.store();
      assert.strictEqual(view.storeOffset, o);
    }
    assert.deepStrictEqual(adapter.writes, [
      pointer(1, { kind: "default" }),
      pointer(2, { kind: "default" }),
      pointer(3, { kind: "default" }),
    ]);
    assert.deepStrictEqual(view.stateRef, { kind: "default" });
  });

  test("Given a stored Added event (handler ran, no strategy), When store, Then a full row is written and stateRef becomes { kind: 'row', offset: that offset }", async () => {
    const adapter = new RecordingAdapter();
    const view = factory(allHandlers).create("s-1", adapter);
    view.applyEvent(added(1, 5));
    await view.store();
    assert.deepStrictEqual(adapter.writes, [
      { offset: 1, body: { kind: "full", state: { sum: 5, closed: false } } },
    ]);
    assert.deepStrictEqual(view.stateRef, { kind: "row", offset: 1 });
  });

  test("Given a full row at 2, When an event with no handler is stored at 3, Then a pointer row to row 2 is written at offset 3", async () => {
    const adapter = new RecordingAdapter();
    const view = factory(closedOnly).create("s-1", adapter);
    view.applyEvent(added(1));
    await view.store();
    view.applyEvent(closed(2));
    await view.store();
    view.applyEvent(added(3));
    await view.store();
    assert.deepStrictEqual(adapter.writes, [
      pointer(1, { kind: "default" }),
      { offset: 2, body: { kind: "full", state: { sum: 0, closed: true } } },
      pointer(3, { kind: "row", offset: 2 }),
    ]);
    assert.strictEqual(view.storeOffset, 3);
  });

  test("Given a strategy offsetGap(5) and a handler that ran, When store at gap 1, Then nothing is written and storeOffset does not move", async () => {
    const adapter = new RecordingAdapter();
    const view = factory(
      allHandlers,
      createSnapshotStrategy<State, Events>((s) => s.offsetGap(5)),
    ).create("s-1", adapter);
    view.applyEvent(added(1));
    await view.store();
    assert.deepStrictEqual(adapter.writes, []);
    assert.strictEqual(view.storeOffset, -1);
    assert.deepStrictEqual(view.stateRef, { kind: "default" });
  });

  test("Given no new events since the last row, When store, Then nothing is written", async () => {
    const adapter = new RecordingAdapter();
    const view = factory(closedOnly).create("s-1", adapter);
    view.applyEvent(added(1));
    await view.store();
    await view.store();
    assert.deepStrictEqual(adapter.writes, [pointer(1, { kind: "default" })]);
  });

  test("Given a dirty view, When the adapter throws on store, Then storeOffset, stateRef and dirty do not change, and the next store writes a full row", async () => {
    const adapter = new RecordingAdapter();
    const view = factory(allHandlers).create("s-1", adapter);
    view.applyEvent(added(1));
    adapter.failNext = true;
    await assert.rejects(() => view.store(), /store failed/);
    assert.strictEqual(view.storeOffset, -1);
    assert.deepStrictEqual(view.stateRef, { kind: "default" });
    await view.store();
    assert.deepStrictEqual(adapter.writes, [
      { offset: 1, body: { kind: "full", state: { sum: 1, closed: false } } },
    ]);
    assert.strictEqual(view.storeOffset, 1);
    assert.deepStrictEqual(view.stateRef, { kind: "row", offset: 1 });
  });

  test("Given a clean view, When the adapter throws on a pointer write, Then storeOffset and stateRef do not change, and the next store writes the pointer", async () => {
    const adapter = new RecordingAdapter();
    const view = factory(closedOnly).create("s-1", adapter);
    view.applyEvent(added(1));
    adapter.failNext = true;
    await assert.rejects(() => view.store(), /store failed/);
    assert.strictEqual(view.storeOffset, -1);
    await view.store();
    assert.deepStrictEqual(adapter.writes, [pointer(1, { kind: "default" })]);
    assert.strictEqual(view.storeOffset, 1);
  });

  test("Given a full write in flight, When an event with a handler is applied before it resolves, Then the next store writes a full row, not a pointer", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter = new RecordingAdapter();
    const original = adapter.storeSnapshotAsync.bind(adapter);
    let first = true;
    adapter.storeSnapshotAsync = async (data) => {
      if (first) {
        first = false;
        await gate;
      }
      return original(data);
    };
    const view = factory(allHandlers).create("s-1", adapter);
    view.applyEvent(added(1));
    const firstStore = view.store();
    view.applyEvent(added(2));
    release();
    await firstStore;
    assert.strictEqual(view.storeOffset, 1);
    assert.deepStrictEqual(view.stateRef, { kind: "row", offset: 1 });
    await view.store();
    assert.deepStrictEqual(adapter.writes, [
      { offset: 1, body: { kind: "full", state: { sum: 1, closed: false } } },
      { offset: 2, body: { kind: "full", state: { sum: 2, closed: false } } },
    ]);
  });

  test("Given a snapshot result with stateRef default and offset 4, When the view is built, Then state equals defaultState and stateRef is default", async () => {
    const adapter = new RecordingAdapter();
    await adapter.storeSnapshotAsync(
      EvDbStoredSnapshotData.fromAddress(viewAddress, 4, -1, {
        kind: "pointer",
        stateRef: { kind: "default" },
      }),
    );
    const view = await factory(closedOnly).get("s-1", adapter);
    assert.strictEqual(view.storeOffset, 4);
    assert.deepStrictEqual(view.state, { sum: 0, closed: false });
    assert.deepStrictEqual(view.stateRef, { kind: "default" });
  });

  test("Given defaultState 0 and a stored full row with state 0, When the view loads and stores a no-handler event, Then the pointer names the full row", async () => {
    const adapter = new RecordingAdapter();
    await adapter.storeSnapshotAsync(
      EvDbStoredSnapshotData.fromAddress(viewAddress, 2, -1, { kind: "full", state: 0 }),
    );
    adapter.writes = [];
    const view = await createViewFactory<number, Events>({
      viewName: "V",
      streamType: "S",
      defaultState: 0,
      handlers: { Closed: (s) => s + 1 },
    }).get("s-1", adapter);
    assert.strictEqual(view.state, 0);
    assert.deepStrictEqual(view.stateRef, { kind: "row", offset: 2 });
    view.applyEvent(added(3));
    await view.store();
    assert.deepStrictEqual(adapter.writes, [pointer(3, { kind: "row", offset: 2 })]);
  });

  test("Given a pointer row whose full row is missing, When get, Then it throws naming the view and offsets", async () => {
    const adapter = new RecordingAdapter();
    await adapter.storeSnapshotAsync(
      EvDbStoredSnapshotData.fromAddress(viewAddress, 5, -1, {
        kind: "pointer",
        stateRef: { kind: "row", offset: 3 },
      }),
    );
    await assert.rejects(() => factory(closedOnly).get("s-1", adapter), /S\/s-1\/V.*5.*3/);
  });

  for (const mode of ["always", "trusted"] as const) {
    const withMode = (extra?: (b: EvDbSnapshotStrategyBuilder<State, Events>) => void) =>
      createSnapshotStrategy<State, Events>((b) => {
        b.changeDetection(mode);
        extra?.(b);
      });

    test(`Given a view loaded from a snapshot (${mode}), When catch-up events with a handler are applied without rules and store runs, Then a full row is written, not a pointer`, async () => {
      const adapter = new RecordingAdapter();
      await adapter.storeSnapshotAsync(
        EvDbStoredSnapshotData.fromAddress(viewAddress, 2, -1, {
          kind: "full",
          state: { sum: 2, closed: false },
        }),
      );
      adapter.writes = [];
      const view = await factory(allHandlers, withMode()).get("s-1", adapter);
      view.applyEvent(added(3), false);
      view.applyEvent(added(4), false);
      await view.store();
      assert.deepStrictEqual(adapter.writes, [
        { offset: 4, body: { kind: "full", state: { sum: 4, closed: false } } },
      ]);
    });

    test(`Given a dirty view whose strategy is not due (${mode}), When a no-handler event follows and store runs, Then nothing is written`, async () => {
      const adapter = new RecordingAdapter();
      const view = factory(
        closedOnly,
        withMode((b) => b.offsetGap(5)),
      ).create("s-1", adapter);
      view.applyEvent(closed(1));
      view.applyEvent(added(2));
      await view.store();
      assert.deepStrictEqual(adapter.writes, []);
      assert.strictEqual(view.storeOffset, -1);
    });
  }

  test("Given a custom EvDbView subclass, When any event is applied and store runs, Then a full row is written", async () => {
    class CustomView extends EvDbView<number> {
      constructor(
        adapter: IEvDbStorageSnapshotAdapter,
        snapshot: EvDbStoredSnapshotResult<number>,
      ) {
        super(viewAddress, adapter, snapshot, 0);
      }
      handleOnApply(oldState: number): number {
        return oldState;
      }
    }
    const adapter = new RecordingAdapter();
    const view = new CustomView(adapter, EvDbStoredSnapshotResult.getEmptyState<number>());
    view.applyEvent(added(1));
    await view.store();
    assert.deepStrictEqual(adapter.writes, [{ offset: 1, body: { kind: "full", state: 0 } }]);
  });

  test("Given a full write in flight, When an event with no handler is applied before it resolves, Then the next store writes a full row of the current state, not a pointer", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter = new RecordingAdapter();
    const original = adapter.storeSnapshotAsync.bind(adapter);
    let first = true;
    adapter.storeSnapshotAsync = async (data) => {
      if (first) {
        first = false;
        await gate;
      }
      return original(data);
    };
    const view = factory(closedOnly).create("s-1", adapter);
    view.applyEvent(closed(1));
    const firstStore = view.store();
    view.applyEvent(added(2));
    release();
    await firstStore;
    assert.deepStrictEqual(view.stateRef, { kind: "row", offset: 1 });
    await view.store();
    assert.deepStrictEqual(adapter.writes, [
      { offset: 1, body: { kind: "full", state: { sum: 0, closed: true } } },
      { offset: 2, body: { kind: "full", state: { sum: 0, closed: true } } },
    ]);
  });
});
