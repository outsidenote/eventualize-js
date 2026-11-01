import * as assert from "node:assert";
import { readFile } from "node:fs/promises";
import { test, describe, before, after } from "node:test";
import Steps from "./steps.js";
import { EVENT_STORE_TYPE } from "./EVENT_STORE_TYPE.js";
import { TestManager } from "./TestContainerManager/TestManager.js";
import { SNAPSHOT_V2_DATABASES, seedOldSnapshotTable } from "./snapshotV2.test-support.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { createDynamoDBClient } from "@eventualize/dynamodb-storage-adapter/DynamoDbClient";
import { copySnapshotsToV2 } from "@eventualize/dynamodb-storage-adapter/copySnapshotsToV2";

type StoreClientType = ReturnType<typeof Steps.createStoreClient>;

const VIEW_A = new EvDbViewAddress("snapshot-migration-stream", "stream-1", "A");
const VIEW_B = new EvDbViewAddress("snapshot-migration-stream", "stream-1", "B");

const SCRIPT_PACKAGES: Partial<Record<EVENT_STORE_TYPE, string>> = {
  [EVENT_STORE_TYPE.POSTGRES]: "postgres-storage-adapter",
  [EVENT_STORE_TYPE.MYSQL]: "mysql-storage-adapter",
};

async function readCopyScript(storeType: EVENT_STORE_TYPE): Promise<string> {
  const pkg = SCRIPT_PACKAGES[storeType];
  assert.ok(pkg, `no copy script for ${storeType}`);
  const url = new URL(
    `../../../../packages/adapters/${pkg}/scripts/copy-snapshot-to-snapshot-v2.sql`,
    import.meta.url,
  );
  return readFile(url, "utf8");
}

describe("snapshot to snapshot_v2 migration", () => {
  const testManager = new TestManager();

  before(async () => {
    await testManager.start();
  });

  after(async () => {
    await testManager.stop();
  });

  test("copy scripts", async () => {
    const databases = testManager.supportedDatabases.filter((db) =>
      SNAPSHOT_V2_DATABASES.includes(db),
    );
    for (const storeType of databases) {
      await test(`${storeType} execution`, async (t) => {
        let storeClient: StoreClientType;
        let adapter: IEvDbStorageAdapter;

        const seed = (address: EvDbViewAddress, offset: number, sum?: number) =>
          seedOldSnapshotTable(
            storeType,
            storeClient,
            testManager.getDynamoDbOptions(),
            address,
            offset,
            sum,
          );
        const seedOldTable = async () => {
          await seed(VIEW_A, 3);
          await seed(VIEW_A, 7);
          await seed(VIEW_B, 2);
        };
        const runCopy = async () => {
          if (storeType === EVENT_STORE_TYPE.DYNAMODB) {
            await copySnapshotsToV2(createDynamoDBClient(testManager.getDynamoDbOptions()));
            return;
          }
          assert.ok(storeClient, "relational store client expected");
          await storeClient.$executeRawUnsafe(await readCopyScript(storeType));
        };

        await t.before(async () => {
          storeClient = Steps.createStoreClient(
            storeType,
            testManager.getConnection(storeType) as string | undefined,
          );
          adapter = Steps.createStorageAdapter(
            storeType,
            storeClient,
            testManager.getDynamoDbOptions(),
          );
        });

        t.beforeEach(async () => {
          await Steps.clearEnvironment(storeClient, storeType, testManager.getDynamoDbOptions());
        });

        const assertLatest = async () => {
          const a = await adapter.getSnapshotAsync(VIEW_A);
          assert.strictEqual(a.offset, 7);
          assert.deepStrictEqual(a.state, { sum: 1 });
          assert.deepStrictEqual(a.stateRef, { kind: "row", offset: 7 });
          const b = await adapter.getSnapshotAsync(VIEW_B);
          assert.strictEqual(b.offset, 2);
          assert.deepStrictEqual(b.state, { sum: 1 });
          assert.deepStrictEqual(b.stateRef, { kind: "row", offset: 2 });
        };

        await t.test(
          "Given old rows A@3, A@7 and B@2, When the copy runs, Then snapshot_v2 holds A@7 and B@2 as full rows, and getSnapshotAsync returns them",
          async () => {
            await seedOldTable();
            await runCopy();
            await assertLatest();
            const olderA = await adapter.getSnapshotAsync(VIEW_A, 6);
            assert.strictEqual(olderA.offset, -1, "only the latest row per view is copied");
          },
        );

        await t.test(
          "Given old rows, When the copy runs twice, Then it does not fail and the rows are unchanged",
          async () => {
            await seedOldTable();
            await runCopy();
            await runCopy();
            await assertLatest();
          },
        );

        await t.test(
          "Given snapshot_v2 already has A@9, When the copy runs, Then getSnapshotAsync(A) still returns offset 9",
          async () => {
            await adapter.storeSnapshotAsync(
              EvDbStoredSnapshotData.fromAddress(VIEW_A, 9, 9, {
                kind: "full",
                state: { sum: 99 },
              }),
            );
            await seedOldTable();
            await runCopy();
            const a = await adapter.getSnapshotAsync(VIEW_A);
            assert.strictEqual(a.offset, 9);
            assert.deepStrictEqual(a.state, { sum: 99 });
          },
        );

        await t.test(
          "Given old rows with distinct states A@3 {sum:3}, A@7 {sum:7} and B@2 {sum:2}, When the copy runs, Then the copied state of A is {sum:7} and of B is {sum:2}",
          async () => {
            await seed(VIEW_A, 3, 3);
            await seed(VIEW_A, 7, 7);
            await seed(VIEW_B, 2, 2);
            await runCopy();
            const a = await adapter.getSnapshotAsync(VIEW_A);
            assert.strictEqual(a.offset, 7);
            assert.deepStrictEqual(a.state, { sum: 7 });
            const b = await adapter.getSnapshotAsync(VIEW_B);
            assert.strictEqual(b.offset, 2);
            assert.deepStrictEqual(b.state, { sum: 2 });
          },
        );

        await t.test(
          "Given snapshot_v2 has a pointer at 7 to row 5 and the old table has A@7, When the copy runs, Then the pointer is not overwritten and getSnapshotAsync resolves the row-5 state",
          async () => {
            await adapter.storeSnapshotAsync(
              EvDbStoredSnapshotData.fromAddress(VIEW_A, 5, 5, {
                kind: "full",
                state: { sum: 50 },
              }),
            );
            await adapter.storeSnapshotAsync(
              EvDbStoredSnapshotData.fromAddress(VIEW_A, 7, 7, {
                kind: "pointer",
                stateRef: { kind: "row", offset: 5 },
              }),
            );
            await seed(VIEW_A, 3, 3);
            await seed(VIEW_A, 7, 7);
            await runCopy();
            const a = await adapter.getSnapshotAsync(VIEW_A);
            assert.strictEqual(a.offset, 7);
            assert.deepStrictEqual(a.state, { sum: 50 });
            assert.deepStrictEqual(a.stateRef, { kind: "row", offset: 5 });
          },
        );

        await t.test(
          "Given snapshot_v2 has a pointer at 9 to row 5 and the old table has A@7, When the copy runs, Then getSnapshotAsync still returns offset 9 with the row-5 state",
          async () => {
            await adapter.storeSnapshotAsync(
              EvDbStoredSnapshotData.fromAddress(VIEW_A, 5, 5, {
                kind: "full",
                state: { sum: 50 },
              }),
            );
            await adapter.storeSnapshotAsync(
              EvDbStoredSnapshotData.fromAddress(VIEW_A, 9, 9, {
                kind: "pointer",
                stateRef: { kind: "row", offset: 5 },
              }),
            );
            await seed(VIEW_A, 7, 7);
            await runCopy();
            const a = await adapter.getSnapshotAsync(VIEW_A);
            assert.strictEqual(a.offset, 9);
            assert.deepStrictEqual(a.state, { sum: 50 });
            assert.deepStrictEqual(a.stateRef, { kind: "row", offset: 5 });
          },
        );

        if (storeType === EVENT_STORE_TYPE.DYNAMODB) {
          await t.test(
            "Given old rows that fill more than one Scan page (1 MB), When copySnapshotsToV2 runs, Then Scan runs more than once and every view is copied",
            async () => {
              // A Scan page holds at most 1 MB, so four ~350 KB items need at least two pages.
              const viewCount = 4;
              const padding = "x".repeat(350 * 1024);
              const dynamo = createDynamoDBClient(testManager.getDynamoDbOptions());
              const addresses = Array.from(
                { length: viewCount },
                (_, i) => new EvDbViewAddress("snapshot-migration-stream", "stream-1", `Big${i}`),
              );
              for (const [i, address] of addresses.entries()) {
                await dynamo.send(
                  new PutItemCommand({
                    TableName: "snapshots",
                    Item: {
                      view_address: {
                        S: `${address.streamType}::${address.streamId}::${address.viewName}`,
                      },
                      offset: { N: (i + 1).toString() },
                      state: {
                        M: {
                          __state: { M: { sum: { N: (i + 1).toString() }, pad: { S: padding } } },
                        },
                      },
                      stored_at: { S: Date.now().toString() },
                    },
                  }),
                );
              }

              const client = createDynamoDBClient(testManager.getDynamoDbOptions());
              let scans = 0;
              client.middlewareStack.add(
                (next, context) => async (args) => {
                  if (context.commandName === "ScanCommand") scans++;
                  return next(args);
                },
                { step: "initialize", name: "countScans" },
              );
              const result = await copySnapshotsToV2(client);

              assert.ok(scans > 1, `expected more than one Scan page, got ${scans}`);
              assert.deepStrictEqual(result, { views: viewCount, copied: viewCount });
              for (const [i, address] of addresses.entries()) {
                const snapshot = await adapter.getSnapshotAsync(address);
                assert.strictEqual(snapshot.offset, i + 1);
              }
            },
          );
        }

        await t.after(async () => {
          await Steps.clearEnvironment(storeClient, storeType, testManager.getDynamoDbOptions());
        });
      });
    }
  });
});
