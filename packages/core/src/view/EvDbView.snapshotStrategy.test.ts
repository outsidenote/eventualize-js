import { test, describe, afterEach, mock } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import InMemoryStorageAdapter from "../store/InMemoryStorageAdapter.test-support.js";
import { createViewFactory } from "../factories/EvDbViewFactory.js";
import { createSnapshotStrategy } from "./EvDbSnapshotStrategyBuilder.js";
import type { EvDbSnapshotStrategy } from "./EvDbSnapshotStrategyBuilder.js";
import type { EvDbView } from "./EvDbView.js";

type Events = { Added: { points: number }; Closed: { reason: string } };
type State = { sum: number; closed: boolean };

class RecordingAdapter extends InMemoryStorageAdapter {
  public storedOffsets: number[] = [];
  public failNext = false;

  override async storeSnapshotAsync(data: EvDbStoredSnapshotData): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("store failed");
    }
    await super.storeSnapshotAsync(data);
    this.storedOffsets.push(data.offset);
  }
}

const address = new EvDbStreamAddress("S", "s-1");
const added = (offset: number, points = 1): EvDbEvent =>
  new EvDbEvent("Added", new EvDbStreamCursor(address, offset), { points });
const closed = (offset: number): EvDbEvent =>
  new EvDbEvent("Closed", new EvDbStreamCursor(address, offset), { reason: "done" });

function build(
  adapter: RecordingAdapter,
  snapshotStrategy?: EvDbSnapshotStrategy<State>,
): EvDbView<State> {
  return createViewFactory<State, Events>({
    viewName: "V",
    streamType: "S",
    defaultState: { sum: 0, closed: false },
    handlers: {
      Added: (s, e) => ({ ...s, sum: s.sum + e.points }),
      Closed: (s) => ({ ...s, closed: true }),
    },
    snapshotStrategy,
  }).create("s-1", adapter);
}

describe("EvDbView snapshot strategy", () => {
  afterEach(() => {
    mock.timers.reset();
  });

  test("Given no strategy When store after each event Then every store writes", async () => {
    const adapter = new RecordingAdapter();
    const view = build(adapter);
    view.applyEvent(added(1));
    await view.store();
    view.applyEvent(added(2));
    await view.store();
    assert.deepStrictEqual(adapter.storedOffsets, [1, 2]);
  });

  test("Given offsetGap(3) When 2 events then store Then nothing; When 3rd event then store Then one snapshot at offset 3", async () => {
    const adapter = new RecordingAdapter();
    const view = build(
      adapter,
      createSnapshotStrategy<State, Events>((s) => s.offsetGap(3)),
    );
    view.applyEvent(added(1));
    view.applyEvent(added(2));
    await view.store();
    assert.deepStrictEqual(adapter.storedOffsets, []);
    view.applyEvent(added(3));
    await view.store();
    assert.deepStrictEqual(adapter.storedOffsets, [3]);
  });

  test("Given offsetGap(3) and a stored snapshot at offset 3 When offsets 4,5 then store Then nothing; When 6 then store Then snapshot at 6", async () => {
    const adapter = new RecordingAdapter();
    const view = build(
      adapter,
      createSnapshotStrategy<State, Events>((s) => s.offsetGap(3)),
    );
    for (const o of [1, 2, 3]) view.applyEvent(added(o));
    await view.store();
    view.applyEvent(added(4));
    view.applyEvent(added(5));
    await view.store();
    assert.deepStrictEqual(adapter.storedOffsets, [3]);
    view.applyEvent(added(6));
    await view.store();
    assert.deepStrictEqual(adapter.storedOffsets, [3, 6]);
  });

  test("Given durationGapMs(1000) When store at +999ms Then nothing; at +1000ms Then stored; then at +1500ms Then nothing", async () => {
    mock.timers.enable({ apis: ["Date"], now: 0 });
    const adapter = new RecordingAdapter();
    const view = build(
      adapter,
      createSnapshotStrategy<State, Events>((s) => s.durationGapMs(1000)),
    );
    view.applyEvent(added(1));
    mock.timers.tick(999);
    await view.store();
    assert.deepStrictEqual(adapter.storedOffsets, []);
    mock.timers.tick(1);
    await view.store();
    assert.deepStrictEqual(adapter.storedOffsets, [1]);
    view.applyEvent(added(2));
    mock.timers.tick(500);
    await view.store();
    assert.deepStrictEqual(adapter.storedOffsets, [1]);
  });

  test("Given onEvent matching Closed When Added, store Then nothing; When Closed, store Then stored; When Added, store Then nothing", async () => {
    const adapter = new RecordingAdapter();
    const view = build(
      adapter,
      createSnapshotStrategy<State, Events>((s) => s.onEvent("Closed")),
    );
    view.applyEvent(added(1));
    await view.store();
    assert.deepStrictEqual(adapter.storedOffsets, []);
    view.applyEvent(closed(2));
    await view.store();
    assert.deepStrictEqual(adapter.storedOffsets, [2]);
    view.applyEvent(added(3));
    await view.store();
    assert.deepStrictEqual(adapter.storedOffsets, [2]);
  });

  test("Given onEvent predicate When it sees state Then state includes the event", async () => {
    const adapter = new RecordingAdapter();
    const seen: number[] = [];
    const view = build(
      adapter,
      createSnapshotStrategy<State, Events>((s) =>
        s.onEvent("Added", (state, event) => {
          seen.push(state.sum);
          assert.strictEqual(state.sum, event.points);
          return true;
        }),
      ),
    );
    view.applyEvent(added(1, 5));
    assert.deepStrictEqual(seen, [5]);
  });

  test("Given onEvent match and adapter throws once When store Then rejects, storeOffset unchanged; When store again Then stored", async () => {
    const adapter = new RecordingAdapter();
    const view = build(
      adapter,
      createSnapshotStrategy<State, Events>((s) => s.onEvent("Closed")),
    );
    view.applyEvent(closed(1));
    adapter.failNext = true;
    await assert.rejects(() => view.store(), /store failed/);
    assert.strictEqual(view.storeOffset, -1);
    await view.store();
    assert.deepStrictEqual(adapter.storedOffsets, [1]);
    assert.strictEqual(view.storeOffset, 1);
  });

  test("Given only onEvent rules and no match When many stores Then nothing stored", async () => {
    const adapter = new RecordingAdapter();
    const view = build(
      adapter,
      createSnapshotStrategy<State, Events>((s) => s.onEvent("Closed")),
    );
    for (let i = 1; i <= 5; i++) {
      view.applyEvent(added(i));
      await view.store();
    }
    assert.deepStrictEqual(adapter.storedOffsets, []);
  });

  test("Given onEvent predicate When same event applied twice Then predicate called once", () => {
    const adapter = new RecordingAdapter();
    let calls = 0;
    const view = build(
      adapter,
      createSnapshotStrategy<State, Events>((s) =>
        s.onEvent(() => {
          calls++;
          return false;
        }),
      ),
    );
    const event = added(1);
    view.applyEvent(event);
    view.applyEvent(event);
    assert.strictEqual(calls, 1);
  });

  test("Given onEvent match When applyEvent(e, false) Then predicate not called and store writes nothing", async () => {
    const adapter = new RecordingAdapter();
    let calls = 0;
    const view = build(
      adapter,
      createSnapshotStrategy<State, Events>((s) =>
        s.onEvent(() => {
          calls++;
          return true;
        }),
      ),
    );
    view.applyEvent(added(1), false);
    await view.store();
    assert.strictEqual(calls, 0);
    assert.deepStrictEqual(adapter.storedOffsets, []);
  });

  test("Given predicate throws When applyEvent Then throws", () => {
    const adapter = new RecordingAdapter();
    const view = build(
      adapter,
      createSnapshotStrategy<State, Events>((s) =>
        s.onEvent(() => {
          throw new Error("boom");
        }),
      ),
    );
    assert.throws(() => view.applyEvent(added(1)), /boom/);
  });

  test("Given a snapshot write in flight When a matching event is applied Then the next store writes again", async () => {
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
    const view = build(
      adapter,
      createSnapshotStrategy<State, Events>((s) => s.onEvent("Closed")),
    );
    view.applyEvent(closed(1));
    const firstStore = view.store();
    view.applyEvent(closed(2));
    release();
    await firstStore;
    assert.strictEqual(view.storeOffset, 1);
    await view.store();
    assert.deepStrictEqual(adapter.storedOffsets, [1, 2]);
  });
});
