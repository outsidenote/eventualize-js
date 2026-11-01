import { describe, test } from "node:test";
import assert from "node:assert/strict";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import { createSnapshotStrategy } from "./EvDbSnapshotStrategyBuilder.js";

type Events = { Added: { points: number }; Closed: { reason: string } };

const meta = (eventType: "Added" | "Closed") => ({
  eventType,
  streamCursor: new EvDbStreamCursor("T", "1", 1),
  capturedAt: new Date(),
  capturedBy: "u",
});

const ctx = (offsetGap: number, durationGapMs = 0) => ({ offsetGap, durationGapMs });

describe("createSnapshotStrategy", () => {
  test("Given no rules When shouldStore Then true for any context", () => {
    const s = createSnapshotStrategy<number, Events>(() => {});
    assert.equal(s.hasRules, false);
    assert.equal(s.shouldStore(ctx(0)), true);
    assert.equal(s.shouldStore(ctx(999, 999)), true);
  });

  test("Given offsetGap(50) When gap 49 / 50 Then false / true", () => {
    const s = createSnapshotStrategy<number, Events>((b) => b.offsetGap(50));
    assert.equal(s.shouldStore(ctx(49)), false);
    assert.equal(s.shouldStore(ctx(50)), true);
  });

  test("Given durationGapMs(300_000) When 299_999 / 300_000 Then false / true", () => {
    const s = createSnapshotStrategy<number, Events>((b) => b.durationGapMs(300_000));
    assert.equal(s.shouldStore(ctx(0, 299_999)), false);
    assert.equal(s.shouldStore(ctx(0, 300_000)), true);
  });

  test("Given offsetGap and durationGapMs When either matches Then true", () => {
    const s = createSnapshotStrategy<number, Events>((b) => b.offsetGap(50).durationGapMs(300_000));
    assert.equal(s.shouldStore(ctx(50, 0)), true);
    assert.equal(s.shouldStore(ctx(0, 300_000)), true);
    assert.equal(s.shouldStore(ctx(49, 299_999)), false);
  });

  test("Given when predicate When gap 3 Then true", () => {
    const s = createSnapshotStrategy<number, Events>((b) => b.when((c) => c.offsetGap === 3));
    assert.equal(s.shouldStore(ctx(3)), true);
    assert.equal(s.shouldStore(ctx(4)), false);
  });

  test("Given only onEvent rules When shouldStore Then false", () => {
    const s = createSnapshotStrategy<number, Events>((b) => b.onEvent(() => true));
    assert.equal(s.hasRules, true);
    assert.equal(s.shouldStore(ctx(1000, 1000)), false);
  });

  test("Given two onEvent rules When one matches Then matchesEvent true", () => {
    const s = createSnapshotStrategy<number, Events>((b) =>
      b.onEvent((_s, _e, m) => m.eventType === "Closed").onEvent((state) => state > 10),
    );
    assert.equal(s.matchesEvent(5, { points: 1 }, meta("Added")), false);
    assert.equal(s.matchesEvent(11, { points: 1 }, meta("Added")), true);
    assert.equal(s.matchesEvent(1, { reason: "x" }, meta("Closed")), true);
  });

  test('Given onEvent("Closed") When eventType Added / Closed Then false / true', () => {
    const s = createSnapshotStrategy<number, Events>((b) => b.onEvent("Closed"));
    assert.equal(s.matchesEvent(1, { points: 1 }, meta("Added")), false);
    assert.equal(s.matchesEvent(1, { reason: "x" }, meta("Closed")), true);
  });

  test("Given onEvent(Added, predicate) When Added 5 / Added 20 / Closed Then false / true / false", () => {
    let calls = 0;
    const s = createSnapshotStrategy<number, Events>((b) =>
      b.onEvent("Added", (_s, e) => {
        calls++;
        return e.points > 10;
      }),
    );
    assert.equal(s.matchesEvent(0, { points: 5 }, meta("Added")), false);
    assert.equal(s.matchesEvent(0, { points: 20 }, meta("Added")), true);
    assert.equal(calls, 2);
    assert.equal(s.matchesEvent(0, { reason: "x" }, meta("Closed")), false);
    assert.equal(calls, 2);
  });

  test("Given onEvent one-param predicate Then compiles and matches on state", () => {
    const s = createSnapshotStrategy<number, Events>((b) => b.onEvent((st) => st > 3));
    assert.equal(s.matchesEvent(4, { points: 1 }, meta("Added")), true);
    assert.equal(s.matchesEvent(3, { points: 1 }, meta("Added")), false);
  });

  test("Given invalid values Then throws RangeError", () => {
    assert.throws(() => createSnapshotStrategy<number, Events>((b) => b.offsetGap(-1)), RangeError);
    assert.throws(
      () => createSnapshotStrategy<number, Events>((b) => b.offsetGap(NaN)),
      RangeError,
    );
    assert.throws(
      () => createSnapshotStrategy<number, Events>((b) => b.durationGapMs(-1)),
      RangeError,
    );
  });

  test("Given statement-style callback Then rules are kept", () => {
    const s = createSnapshotStrategy<number, Events>((b) => {
      b.offsetGap(2);
    });
    assert.equal(s.hasRules, true);
    assert.equal(s.shouldStore(ctx(1)), false);
    assert.equal(s.shouldStore(ctx(2)), true);
  });

  test("Given typed onEvent Then event is typed per event type", () => {
    createSnapshotStrategy<number, Events>((b) => b.onEvent("Added", (_s, e) => e.points > 0));
    createSnapshotStrategy<number, Events>((b) =>
      // @ts-expect-error unknown event type
      b.onEvent("Nope"),
    );
    createSnapshotStrategy<number, Events>((b) =>
      // @ts-expect-error Closed has no points
      b.onEvent("Closed", (_s, e) => e.points > 1),
    );
  });
});
