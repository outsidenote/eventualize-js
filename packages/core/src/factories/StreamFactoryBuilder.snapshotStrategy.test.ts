import { test, describe } from "node:test";
import * as assert from "node:assert";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import SpecSampleStreamFactory from "./snapshot-strategy-test/SpecSampleStreamFactory.test-support.js";
import GapAndPlainStreamFactory from "./snapshot-strategy-test/GapAndPlainStreamFactory.test-support.js";
import FirstOffsetStreamFactory from "./snapshot-strategy-test/FirstOffsetStreamFactory.test-support.js";
import CatchUpStreamFactory from "./snapshot-strategy-test/CatchUpStreamFactory.test-support.js";
import ThrowingPredicateStreamFactory from "./snapshot-strategy-test/ThrowingPredicateStreamFactory.test-support.js";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import InMemoryStorageAdapter from "../store/InMemoryStorageAdapter.test-support.js";

/** Records every snapshot the stream stores. */
class SpyAdapter extends InMemoryStorageAdapter {
  public stored: { viewName: string; offset: number }[] = [];
  public failNextSnapshot = false;
  override async storeSnapshotAsync(data: EvDbStoredSnapshotData): Promise<void> {
    if (this.failNextSnapshot) {
      this.failNextSnapshot = false;
      throw new Error("snapshot write failed");
    }
    this.stored.push({ viewName: data.viewName, offset: data.offset });
    return super.storeSnapshotAsync(data);
  }
}

describe("StreamFactoryBuilder.withView snapshot strategy", () => {
  test("Given the spec sample (Balance, Audit, Risk), When a stream is created, Then it compiles and runs", () => {
    const adapter = new SpyAdapter();
    const stream = SpecSampleStreamFactory.create("a", adapter, adapter);
    assert.strictEqual(stream.views.Balance, 0);
  });

  test("Given one view with offsetGap(2) and one without, When store after 1 event, Then only the default view stored", async () => {
    const adapter = new SpyAdapter();
    const stream = GapAndPlainStreamFactory.create("a", adapter, adapter);
    await stream.appendEventPointsAdded({ points: 1 });
    await stream.store();
    assert.deepStrictEqual(
      adapter.stored.map((s) => s.viewName),
      ["Plain"],
    );
  });

  test("Given onEvent on the first offset, When first then second event stored, Then snapshot only after the first", async () => {
    const adapter = new SpyAdapter();
    const stream = FirstOffsetStreamFactory.create("a", adapter, adapter);
    await stream.appendEventPointsAdded({ points: 1 });
    await stream.store();
    assert.deepStrictEqual(adapter.stored, [{ viewName: "V", offset: 1 }]);
    await stream.appendEventPointsAdded({ points: 1 });
    await stream.store();
    assert.strictEqual(adapter.stored.length, 1);
  });

  test("Given offsetGap(-1), When withView runs, Then throws RangeError", async () => {
    await assert.rejects(
      import("./snapshot-strategy-test/InvalidOffsetGapStreamFactory.test-support.js"),
      RangeError,
    );
  });

  test("Given a matching event stored with no snapshot, When get() catches up then one non-matching event is stored, Then no snapshot", async () => {
    const adapter = new SpyAdapter();
    const first = CatchUpStreamFactory.create("a", adapter, adapter);
    await first.appendEventPointsAdded({ points: 5_000 });
    adapter.failNextSnapshot = true;
    await assert.rejects(first.store(), /snapshot write failed/);
    assert.strictEqual(adapter.stored.length, 0);

    // The matching event is stored but no snapshot exists, so get() replays it from offset 1.
    const second = await CatchUpStreamFactory.get("a", adapter, adapter);
    assert.strictEqual(second.views.V, 5_000);
    await second.appendEventAccountClosed({});
    await second.store();
    assert.strictEqual(adapter.stored.length, 0);
  });

  test("Given a view whose onEvent predicate throws, When goToOffset replays stored events, Then it does not run the predicate", async () => {
    const adapter = new SpyAdapter();
    const address = new EvDbStreamAddress("S", "a");
    adapter.seedEvents(
      [1, 2, 3].map(
        (offset) =>
          new EvDbEvent("PointsAdded", new EvDbStreamCursor(address, offset), { points: 10 }),
      ),
    );
    const stream = await ThrowingPredicateStreamFactory.goToOffset("a", 2, adapter, adapter);
    assert.strictEqual(stream.views.V, 20);
    await stream.forward();
    assert.strictEqual(stream.views.V, 30);
  });
});
