import { test, describe } from "node:test";
import * as assert from "node:assert";
import { generate } from "./generate.js";
import { seededRng } from "../tests/seededRng.js";
import { deposit } from "../commands/commands.js";
import { cents } from "../domain/money.js";
import OCCException from "@eventualize/types/primitives/OCCException";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";
import { ConflictError, ValidationError } from "../errors.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";

const base = { storeEvery: 1 };

/** Throws an OCC collision on its 2nd stream store. */
class CollidingAdapter extends InMemoryStorageAdapter {
  private storeCalls = 0;
  override async storeStreamAsync(
    events: ReadonlyArray<EvDbEvent>,
    messages: ReadonlyArray<EvDbMessage>,
  ): Promise<StreamStoreAffected> {
    this.storeCalls++;
    if (this.storeCalls === 2) throw new OCCException();
    return super.storeStreamAsync(events, messages);
  }
}

describe("generate", () => {
  test("riskSpike then riskCoolDown move risk to 10 then 0", async () => {
    const s = new InMemoryStorageAdapter();
    const spike = await generate(s, "a", { ...base, count: 5, pattern: "riskSpike" }, seededRng(1));
    assert.strictEqual(spike.views.risk, 10);
    const cool = await generate(
      s,
      "a",
      { ...base, count: 20, pattern: "riskCoolDown" },
      seededRng(2),
    );
    assert.strictEqual(cool.views.risk, 0);
    assert.deepStrictEqual(
      [spike.fromOffset, spike.toOffset, cool.fromOffset, cool.toOffset],
      [0, 4, 5, 24],
    );
  });

  test("random produces some WithdrawalDenied and reports them", async () => {
    const s = new InMemoryStorageAdapter();
    const r = await generate(s, "b", { ...base, count: 200, pattern: "random" }, seededRng(3));
    assert.ok(r.denied > 0);
    assert.strictEqual(r.views.stats.denied, r.denied);
    assert.strictEqual(r.count, 200);
  });

  test("targetBalance absolute up and percent down end exactly, with no denials", async () => {
    const s = new InMemoryStorageAdapter();
    await deposit(s, "c", { value: 1000, currency: "USD" });
    const up = await generate(
      s,
      "c",
      { ...base, count: 10, pattern: "targetBalance", target: { mode: "absolute", value: 5000 } },
      seededRng(4),
    );
    assert.strictEqual(cents(up.views.balance.amount), 5000);
    assert.strictEqual(up.denied, 0);
    const down = await generate(
      s,
      "c",
      { ...base, count: 37, pattern: "targetBalance", target: { mode: "percent", value: -30 } },
      seededRng(5),
    );
    assert.strictEqual(cents(down.views.balance.amount), 3500);
    assert.strictEqual(down.denied, 0);
  });

  test("storeEvery K writes ceil(count / K) snapshots per view", async () => {
    const s = new InMemoryStorageAdapter();
    await generate(s, "d", { count: 10, storeEvery: 3, pattern: "riskCoolDown" }, seededRng(6));
    for (const view of ["balance", "stats", "risk"]) {
      assert.strictEqual(s.countSnapshots("playground-funds", "d", view), 4, view);
    }
  });

  test("currency: defaults to the account currency, rejects a mismatch", async () => {
    const s = new InMemoryStorageAdapter();
    await deposit(s, "e", { value: 10, currency: "EUR" });
    const r = await generate(s, "e", { ...base, count: 2, pattern: "riskCoolDown" }, seededRng(7));
    assert.strictEqual(r.views.balance.currency, "EUR");
    await assert.rejects(
      generate(
        s,
        "e",
        { ...base, count: 1, pattern: "riskCoolDown", currency: "USD" },
        seededRng(8),
      ),
      (err) => err instanceof ValidationError,
    );
  });

  test("a new account defaults to USD", async () => {
    const s = new InMemoryStorageAdapter();
    const r = await generate(s, "f", { ...base, count: 1, pattern: "riskSpike" }, seededRng(9));
    assert.strictEqual(r.views.balance.currency, "USD");
  });

  test("unreachable targets are rejected before anything is stored", async () => {
    const s = new InMemoryStorageAdapter();
    await deposit(s, "g", { value: 1000, currency: "USD" });
    for (const target of [
      { mode: "absolute", value: -5 },
      { mode: "absolute", value: 1000 },
      { mode: "absolute", value: 1000.05 },
    ] satisfies Array<{ mode: "absolute"; value: number }>) {
      await assert.rejects(
        generate(s, "g", { ...base, count: 10, pattern: "targetBalance", target }, seededRng(10)),
        (err) => err instanceof ValidationError,
      );
    }
    const next = await deposit(s, "g", { value: 1, currency: "USD" });
    assert.strictEqual(next.offset, 1);
  });

  test("an OCC collision becomes ConflictError with the stored count", async () => {
    const s = new CollidingAdapter();
    await assert.rejects(
      generate(s, "h", { count: 6, storeEvery: 2, pattern: "riskCoolDown" }, seededRng(12)),
      (err) => err instanceof ConflictError && err.message.includes("stored 2 of 6"),
    );
  });
});
