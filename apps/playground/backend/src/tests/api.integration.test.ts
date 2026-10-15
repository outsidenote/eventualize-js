import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import { once } from "node:events";
import { readdir, readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import pg from "pg";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import type { PrismaClient } from "@eventualize/relational-storage-adapter/EvDbPrismaClient";
import { createListAccounts } from "../accounts/listAccounts.js";
import { detect } from "../detection/detect.js";
import { createApp } from "../http/createApp.js";
import { parseDetectBody } from "../http/validation.js";
import type { ReplayBatch, ReplayItem } from "../replay/replayBatch.js";

const MIGRATIONS_DIR = fileURLToPath(
  new URL(
    "../../../../../packages/adapters/postgres-storage-adapter/prisma/migrations",
    import.meta.url,
  ),
);

/** Applies the same Prisma migrations the k8s migrate Job runs. */
async function migrate(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const dirs = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const dir of dirs) {
      await client.query(await readFile(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"));
    }
  } finally {
    await client.end();
  }
}

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let server: Server;
let base: string;

const send = (path: string, body: object) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

async function replayFor(
  account: string,
  offset: number,
  batchSize: number,
  snapshots: boolean,
): Promise<ReplayBatch> {
  const res = await fetch(
    `${base}/api/accounts/${account}/replay?offset=${offset}&batchSize=${batchSize}&snapshots=${snapshots}`,
  );
  assert.strictEqual(res.status, 200);
  return res.json();
}

const replay = (offset: number, batchSize: number, snapshots: boolean) =>
  replayFor("alice", offset, batchSize, snapshots);

const strip = (i: ReplayItem) => ({
  offset: i.offset,
  eventType: i.event_meta.eventType,
  payload: i.event_payload,
  views: i.views,
  messages: i.messages,
});

describe("playground API on Postgres", { timeout: 180_000 }, () => {
  before(async () => {
    container = await new PostgreSqlContainer("postgres:18").start();
    const uri = container.getConnectionUri();
    await migrate(uri);
    prisma = EvDbPostgresPrismaClientFactory.create(uri);
    const app = createApp({
      storage: new EvDbPrismaStorageAdapter(prisma),
      listAccounts: createListAccounts(prisma),
    });
    server = app.listen(0);
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    base = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (server) {
      server.closeAllConnections();
      const closed = once(server, "close");
      server.close();
      await closed;
    }
    await prisma?.$disconnect();
    await container?.stop();
  });

  const commands: Array<["deposit" | "withdraw", number]> = [
    ["deposit", 100],
    ["deposit", 10],
    ["deposit", 100_000],
    ["withdraw", 50],
    ["withdraw", 999_999],
    ["deposit", 0.1],
    ["deposit", 0.2],
    ["withdraw", 20_000],
  ];
  const aliceSnapshots = { stream_type: "playground-funds", stream_id: "alice" };
  let reference: ReplayBatch;

  async function sweep(): Promise<void> {
    for (const batchSize of [1, 3, 20]) {
      for (let offset = 0; offset < commands.length; offset++) {
        const batch = await replay(offset, batchSize, true);
        const expected = reference.items.slice(offset, offset + batchSize).map(strip);
        assert.deepStrictEqual(
          batch.items.map(strip),
          expected,
          `offset=${offset} batch=${batchSize}`,
        );
      }
    }
  }

  test("commands, list, and reference replay", async () => {
    for (const [kind, value] of commands) {
      const res = await send(`/api/accounts/alice/${kind}`, { value, currency: "USD" });
      assert.strictEqual(res.status, 200);
    }
    const bob = await send("/api/accounts/bob/deposit", { value: 1, currency: "EUR" });
    assert.strictEqual(bob.status, 200);

    const accounts = await (await fetch(`${base}/api/accounts`)).json();
    assert.deepStrictEqual(
      accounts.accounts.map((a: { id: string }) => a.id),
      ["alice", "bob"],
    );

    reference = await replay(0, 200, false);
    assert.strictEqual(reference.items.length, commands.length);
    assert.strictEqual(reference.isHead, true);
    assert.strictEqual(reference.items[4].event_meta.eventType, "WithdrawalDenied");
  });

  test("a snapshot is stored per view per event", async () => {
    assert.strictEqual(await prisma.snapshot.count({ where: aliceSnapshots }), 3 * commands.length);
  });

  test("replay with snapshots reads the stored snapshot (tamper check)", async () => {
    const k = 2;
    const where = { ...aliceSnapshots, view_name: "balance", offset: k };
    const original = await prisma.snapshot.findFirstOrThrow({ where });
    const tampered = { amount: -1, currency: "XXX" };
    await prisma.snapshot.updateMany({ where, data: { state: tampered } });
    try {
      const withSnapshots = await replay(k, 1, true);
      assert.deepStrictEqual(withSnapshots.items[0].views.balance, tampered);
      assert.notDeepStrictEqual(
        withSnapshots.items[0].views.balance,
        reference.items[k].views.balance,
      );

      const withoutSnapshots = await replay(k, 1, false);
      assert.deepStrictEqual(withoutSnapshots.items[0].views, reference.items[k].views);
    } finally {
      await prisma.snapshot.updateMany({ where, data: { state: original.state ?? {} } });
    }
    await sweep();
  });

  test("old snapshot plus folding newer events equals the full fold", async () => {
    const deleted = await prisma.snapshot.deleteMany({
      where: { ...aliceSnapshots, offset: { notIn: [0, 4] } },
    });
    assert.strictEqual(deleted.count, 3 * (commands.length - 2));
    assert.strictEqual(await prisma.snapshot.count({ where: aliceSnapshots }), 3 * 2);
    await sweep();
  });

  test("generate with storeEvery 7: sparse snapshots, replay equals full fold", async () => {
    const res = await send("/api/accounts/gen/generate", {
      count: 60,
      pattern: "random",
      storeEvery: 7,
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual([body.fromOffset, body.toOffset], [0, 59]);
    const rows = await prisma.snapshot.count({
      where: { stream_type: "playground-funds", stream_id: "gen" },
    });
    assert.strictEqual(rows, 3 * Math.ceil(60 / 7));
    const reference = await replayFor("gen", 0, 200, false);
    assert.strictEqual(reference.items.length, 60);
    for (const pageSize of [1, 7, 20]) {
      for (let offset = 0; offset < 60; offset++) {
        const batch = await replayFor("gen", offset, pageSize, true);
        assert.deepStrictEqual(
          batch.items.map(strip),
          reference.items.slice(offset, offset + pageSize).map(strip),
          `offset=${offset} pageSize=${pageSize}`,
        );
      }
    }
  });

  test("detect on Postgres equals detect() over a manual fold", async () => {
    assert.strictEqual(
      (await send("/api/accounts/det/generate", { count: 5, pattern: "riskSpike", storeEvery: 2 }))
        .status,
      200,
    );
    assert.strictEqual(
      (
        await send("/api/accounts/det/generate", {
          count: 20,
          pattern: "riskCoolDown",
          storeEvery: 3,
        })
      ).status,
      200,
    );
    const reference = await replayFor("det", 0, 200, false);
    const points = reference.items.map((i) => ({
      offset: i.offset,
      balance: i.views.balance.amount,
      risk: i.views.risk,
    }));
    const cases = [
      { detector: "riskJump", params: { jump: 2.5 } },
      { detector: "riskDecline", params: { percent: 50, window: 5 } },
      { detector: "balanceCrossUp", params: { threshold: 50_000 } },
    ];
    for (const c of cases) {
      const res = await send("/api/accounts/det/detect", c);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      const expected = detect(points, parseDetectBody(c));
      assert.deepStrictEqual(body.matches, expected, JSON.stringify(c));
      assert.strictEqual(body.scanned, 25);
    }
    const jump = await (await send("/api/accounts/det/detect", cases[0])).json();
    assert.deepStrictEqual(jump.matches, [1]);
  });
});
