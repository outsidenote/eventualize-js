import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import { once } from "node:events";
import type { Server } from "node:http";
import { createApp } from "./createApp.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";

let server: Server;
let base: string;

before(async () => {
  const storage = new InMemoryStorageAdapter();
  server = createApp({ storage, listAccounts: async () => ["alice", "ghost"] }).listen(0);
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.close();
  await once(server, "close");
});

const post = (path: string, body: string) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

describe("HTTP API", () => {
  test("GET /api/health", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { status: "ok" });
  });

  test("GET /api/accounts returns summaries for known ids and skips unknown ones", async () => {
    await post("/api/accounts/alice/deposit", JSON.stringify({ value: 7, currency: "USD" }));
    const res = await fetch(`${base}/api/accounts`);
    const body = await res.json();
    assert.strictEqual(body.accounts.length, 1);
    const [a] = body.accounts;
    assert.strictEqual(a.id, "alice");
    assert.strictEqual(typeof a.lastOffset, "number");
    assert.strictEqual(a.balance.currency, "USD");
    assert.strictEqual(typeof a.risk, "number");
  });

  test("deposit, withdraw, head, replay round trip", async () => {
    let res = await post(
      "/api/accounts/alice/deposit",
      JSON.stringify({ value: 100, currency: "USD" }),
    );
    assert.strictEqual(res.status, 200);
    res = await post(
      "/api/accounts/alice/withdraw",
      JSON.stringify({ value: 500, currency: "USD" }),
    );
    const denied = await res.json();
    assert.strictEqual(denied.eventType, "WithdrawalDenied");

    res = await fetch(`${base}/api/accounts/alice`);
    const head = await res.json();
    assert.strictEqual(head.lastOffset, 2);

    res = await fetch(`${base}/api/accounts/alice/replay?offset=0&batchSize=5&snapshots=false`);
    assert.strictEqual(res.status, 200);
    const batch = await res.json();
    assert.strictEqual(batch.items.length, 3);
    assert.strictEqual(batch.isHead, true);
  });

  test("400 on bad input", async () => {
    const cases: Array<[string, string]> = [
      ["/api/accounts/alice/deposit", JSON.stringify({ value: -1, currency: "USD" })],
      ["/api/accounts/alice/deposit", JSON.stringify({ value: "10", currency: "USD" })],
      ["/api/accounts/alice/deposit", JSON.stringify({ value: 10, currency: "usd" })],
      [
        "/api/accounts/alice/deposit",
        JSON.stringify({ value: 10, currency: "USD", description: 5 }),
      ],
      ["/api/accounts/alice/deposit", JSON.stringify({ value: 0.004, currency: "USD" })],
      ["/api/accounts/alice/deposit", '{"value":1e308,"currency":"USD"}'],
      ["/api/accounts/alice/deposit", JSON.stringify({ value: 1e13, currency: "USD" })],
      ["/api/accounts/alice/deposit", "{not json"],
      ["/api/accounts/bad%20name/deposit", JSON.stringify({ value: 10, currency: "USD" })],
    ];
    for (const [path, body] of cases) {
      const res = await post(path, body);
      assert.strictEqual(res.status, 400, `${path} ${body}`);
      assert.ok(typeof (await res.json()).error === "string");
    }
  });

  test("hostile input gives 4xx, not 500", async () => {
    assert.strictEqual((await fetch(`${base}/api/accounts/%E0%A4%A`)).status, 400);
    const big = JSON.stringify({ value: 1, currency: "USD", description: "x".repeat(200_000) });
    assert.strictEqual((await post("/api/accounts/alice/deposit", big)).status, 413);
  });

  test("400 on currency mismatch", async () => {
    await post("/api/accounts/eur/deposit", JSON.stringify({ value: 1, currency: "EUR" }));
    const res = await post(
      "/api/accounts/eur/deposit",
      JSON.stringify({ value: 1, currency: "USD" }),
    );
    assert.strictEqual(res.status, 400);
  });

  test("400 on bad replay query", async () => {
    for (const q of [
      "offset=-1",
      "offset=abc",
      "",
      "offset=0&batchSize=0",
      "offset=0&batchSize=201",
      "offset=0&snapshots=maybe",
      "offset=1&offset=2",
    ]) {
      const res = await fetch(`${base}/api/accounts/alice/replay?${q}`);
      assert.strictEqual(res.status, 400, q);
    }
  });

  test("404 on unknown account and offset past head", async () => {
    assert.strictEqual((await fetch(`${base}/api/accounts/nobody`)).status, 404);
    assert.strictEqual((await fetch(`${base}/api/accounts/nobody/replay?offset=0`)).status, 404);
    assert.strictEqual((await fetch(`${base}/api/accounts/alice/replay?offset=99`)).status, 404);
  });

  test("POST generate appends events and returns the range", async () => {
    const res = await post(
      "/api/accounts/gen1/generate",
      JSON.stringify({ count: 12, pattern: "riskSpike", storeEvery: 5 }),
    );
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual([body.fromOffset, body.toOffset, body.count], [0, 11, 12]);
    assert.strictEqual(body.views.risk, 10);
  });

  test("400 on hostile generate bodies", async () => {
    const bodies = [
      { count: "5", pattern: "random" },
      { count: 0, pattern: "random" },
      { count: 501, pattern: "random" },
      { count: 2.5, pattern: "random" },
      { count: 5, pattern: "drain" },
      { count: 5 },
      { count: 5, pattern: "targetBalance" },
      { count: 5, pattern: "targetBalance", target: { mode: "ratio", value: 1 } },
      { count: 5, pattern: "targetBalance", target: { mode: "absolute", value: "9" } },
      { count: 5, pattern: "random", target: { mode: "absolute", value: 9 } },
      { count: 5, pattern: "targetBalance", target: { mode: "absolute", value: 1e13 } },
      { count: 5, pattern: "targetBalance", target: { mode: "percent", value: -101 } },
      { count: 5, pattern: "targetBalance", target: { mode: "percent", value: 1001 } },
      { count: 5, pattern: "random", storeEvery: 6 },
      { count: 5, pattern: "random", storeEvery: 0 },
      { count: 5, pattern: "random", currency: "usd" },
    ];
    for (const b of bodies) {
      const res = await post("/api/accounts/gen2/generate", JSON.stringify(b));
      assert.strictEqual(res.status, 400, JSON.stringify(b));
    }
    assert.strictEqual((await fetch(`${base}/api/accounts/gen2/timeline`)).status, 404);
  });

  test("GET timeline returns raw events; 404 for unknown", async () => {
    await post("/api/accounts/tl/generate", JSON.stringify({ count: 3, pattern: "riskCoolDown" }));
    const res = await fetch(`${base}/api/accounts/tl/timeline`);
    const body = await res.json();
    assert.strictEqual(body.lastOffset, 2);
    assert.deepStrictEqual(
      body.events.map((e: { offset: number; eventType: string }) => [e.offset, e.eventType]),
      [
        [0, "FundsDeposited"],
        [1, "FundsDeposited"],
        [2, "FundsDeposited"],
      ],
    );
    assert.ok(body.events.every((e: { value: number }) => typeof e.value === "number"));
    assert.strictEqual((await fetch(`${base}/api/accounts/nobody/timeline`)).status, 404);
  });

  test("POST detect returns edge-triggered offsets", async () => {
    await post("/api/accounts/det1/generate", JSON.stringify({ count: 5, pattern: "riskSpike" }));
    const res = await post(
      "/api/accounts/det1/detect",
      JSON.stringify({ detector: "riskJump", params: { jump: 2.5 } }),
    );
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    // risk 3, 6, 9, 10, 10 → jumps at 1 and 2 form one run
    assert.deepStrictEqual(body, {
      detector: "riskJump",
      matches: [1],
      scanned: 5,
      lastOffset: 4,
      truncated: false,
    });
  });

  test("400 on hostile detect bodies, 404 on unknown account", async () => {
    await post("/api/accounts/det2/generate", JSON.stringify({ count: 2, pattern: "riskSpike" }));
    const bodies = [
      {},
      { detector: "riskSpike", params: {} },
      { detector: "riskJump" },
      { detector: "riskJump", params: { jump: 0 } },
      { detector: "riskJump", params: { jump: 11 } },
      { detector: "riskJump", params: { jump: "2" } },
      { detector: "riskJump", params: { jump: 2, window: 3 } },
      { detector: "riskRise", params: { window: 5 } },
      { detector: "riskRise", params: { percent: -1, window: 5 } },
      { detector: "riskRise", params: { percent: 10, window: 0 } },
      { detector: "riskRise", params: { percent: 10, window: 2.5 } },
      { detector: "riskDecline", params: { percent: 1001 } },
      { detector: "balanceCrossUp", params: {} },
      { detector: "balanceCrossUp", params: { threshold: "x" } },
      { detector: "balanceCrossDown", params: { threshold: 1e13 } },
    ];
    for (const b of bodies) {
      const res = await post("/api/accounts/det2/detect", JSON.stringify(b));
      assert.strictEqual(res.status, 400, JSON.stringify(b));
    }
    const res = await post(
      "/api/accounts/nobody/detect",
      JSON.stringify({ detector: "riskJump", params: {} }),
    );
    assert.strictEqual(res.status, 404);
  });

  test("detect threshold is rounded to cents (0.125 behaves as 0.13)", async () => {
    await post("/api/accounts/det3/deposit", JSON.stringify({ value: 0.12, currency: "USD" }));
    await post("/api/accounts/det3/deposit", JSON.stringify({ value: 0.01, currency: "USD" }));
    // balances 0.12, 0.13: 0.13 >= 0.125 only after rounding the threshold to 0.13
    const res = await post(
      "/api/accounts/det3/detect",
      JSON.stringify({ detector: "balanceCrossUp", params: { threshold: 0.125 } }),
    );
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual((await res.json()).matches, [1]);
  });
});
