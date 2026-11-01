import * as assert from "node:assert";
import { test, describe, before, after } from "node:test";
import Steps from "./steps.js";
import { TestManager } from "./TestContainerManager/TestManager.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type { EvDbSnapshotBody } from "@eventualize/types/snapshots/EvDbSnapshotBody";
import {
  SNAPSHOT_V2_DATABASES,
  seedOldSnapshotTable as seedOldSnapshotTableFor,
} from "./snapshotV2.test-support.js";
import { EvDbStoredSnapshotResultRaw } from "@eventualize/types/snapshots/EvDbStoredSnapshotResultRaw";

type StoreClientType = ReturnType<typeof Steps.createStoreClient>;

const ADDRESS = new EvDbViewAddress("snapshot-v2-stream", "stream-1", "Sum");

describe("snapshot_v2 adapter integration", () => {
  const testManager = new TestManager();

  before(async () => {
    await testManager.start();
  });

  after(async () => {
    await testManager.stop();
  });

  test("snapshot_v2 rows", async () => {
    const databases = testManager.supportedDatabases.filter((db) =>
      SNAPSHOT_V2_DATABASES.includes(db),
    );
    for (const storeType of databases) {
      await test(`${storeType} execution`, async (t) => {
        let storeClient: StoreClientType;
        let adapter: IEvDbStorageAdapter;

        const store = (offset: number, body: EvDbSnapshotBody) =>
          adapter.storeSnapshotAsync(
            EvDbStoredSnapshotData.fromAddress(ADDRESS, offset, offset, body),
          );
        const seedOldSnapshotTable = (offset: number) =>
          seedOldSnapshotTableFor(
            storeType,
            storeClient,
            testManager.getDynamoDbOptions(),
            ADDRESS,
            offset,
          );
        const full = (offset: number, state: unknown) => store(offset, { kind: "full", state });
        const pointer = (offset: number, rowOffset: number) =>
          store(offset, { kind: "pointer", stateRef: { kind: "row", offset: rowOffset } });

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

        await t.test(
          "Given a full row at 5 and a pointer at 8 to row 5, When getSnapshotAsync, Then offset is 8 with the row-5 state",
          async () => {
            await full(5, { sum: 50 });
            await pointer(8, 5);
            const result = await adapter.getSnapshotAsync(ADDRESS);
            assert.strictEqual(result.offset, 8);
            assert.deepStrictEqual(result.state, { sum: 50 });
            assert.deepStrictEqual(result.stateRef, { kind: "row", offset: 5 });
          },
        );

        await t.test(
          "Given the same rows, When getSnapshotAsync with maxOffset 6, Then offset is 5",
          async () => {
            await full(5, { sum: 50 });
            await pointer(8, 5);
            const result = await adapter.getSnapshotAsync(ADDRESS, 6);
            assert.strictEqual(result.offset, 5);
            assert.deepStrictEqual(result.state, { sum: 50 });
            assert.deepStrictEqual(result.stateRef, { kind: "row", offset: 5 });
          },
        );

        await t.test(
          "Given only a full row at 5, When getSnapshotAsync with maxOffset 4, Then the result is Empty",
          async () => {
            await full(5, { sum: 50 });
            const result = await adapter.getSnapshotAsync(ADDRESS, 4);
            assert.strictEqual(result, EvDbStoredSnapshotResultRaw.Empty);
            assert.strictEqual(result.offset, -1);
          },
        );

        await t.test(
          "Given a default pointer at 3, When getSnapshotAsync, Then state is undefined and stateRef is default",
          async () => {
            await store(3, { kind: "pointer", stateRef: { kind: "default" } });
            const result = await adapter.getSnapshotAsync(ADDRESS);
            assert.strictEqual(result.offset, 3);
            assert.strictEqual(result.state, undefined);
            assert.deepStrictEqual(result.stateRef, { kind: "default" });
          },
        );

        await t.test(
          "Given a full row at 10 whose state is null, When getSnapshotAsync, Then state is null and stateRef is row 10",
          async () => {
            await full(10, null);
            const result = await adapter.getSnapshotAsync(ADDRESS);
            assert.strictEqual(result.offset, 10);
            assert.strictEqual(result.state, null);
            assert.deepStrictEqual(result.stateRef, { kind: "row", offset: 10 });
          },
        );

        await t.test(
          "Given a pointer to a missing row, When getSnapshotAsync, Then it throws naming the view and offsets",
          async () => {
            await pointer(8, 5);
            await assert.rejects(
              adapter.getSnapshotAsync(ADDRESS),
              /offset 8 for snapshot-v2-stream\/stream-1\/Sum.*offset 5/,
            );
          },
        );

        await t.test(
          "Given a full row in the old snapshot table only, When getSnapshotAsync, Then the result is Empty",
          async () => {
            await seedOldSnapshotTable(4);
            const result = await adapter.getSnapshotAsync(ADDRESS);
            assert.strictEqual(result.offset, -1);
          },
        );

        await t.after(async () => {
          await Steps.clearEnvironment(storeClient, storeType, testManager.getDynamoDbOptions());
        });
      });
    }
  });
});
