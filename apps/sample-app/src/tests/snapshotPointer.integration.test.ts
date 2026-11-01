import * as assert from "node:assert";
import { test, describe, before, after } from "node:test";
import Steps from "./steps.js";
import { EVENT_STORE_TYPE } from "./EVENT_STORE_TYPE.js";
import { TestManager } from "./TestContainerManager/TestManager.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import { createDynamoDBClient } from "@eventualize/dynamodb-storage-adapter/DynamoDbClient";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import PointerRowsStreamFactory from "./factories/PointerRowsStreamFactory.js";

type StoreClientType = ReturnType<typeof Steps.createStoreClient>;
type FlatState = Readonly<Record<string, number | boolean>>;

// Databases whose adapter implements snapshot_v2 pointer rows.
const SNAPSHOT_V2_DATABASES: EVENT_STORE_TYPE[] = [
  EVENT_STORE_TYPE.POSTGRES,
  EVENT_STORE_TYPE.MYSQL,
  EVENT_STORE_TYPE.DYNAMODB,
];

const STREAM_TYPE = PointerRowsStreamFactory.getStreamType();
const TICKS = 20;

const toAttribute = (value: number | boolean): AttributeValue =>
  typeof value === "number" ? { N: value.toString() } : { BOOL: value };

describe("snapshot pointer rows integration", () => {
  const testManager = new TestManager();

  before(async () => {
    await testManager.start();
  });

  after(async () => {
    await testManager.stop();
  });

  test("pointer rows through the stream factory", async () => {
    const databases = testManager.supportedDatabases.filter((db) =>
      SNAPSHOT_V2_DATABASES.includes(db),
    );
    for (const storeType of databases) {
      await test(`${storeType} execution`, async (t) => {
        let storeClient: StoreClientType;
        let adapter: IEvDbStorageAdapter;

        const seedOldSnapshotTable = async (
          streamId: string,
          viewName: string,
          offset: number,
          state: FlatState,
        ) => {
          if (storeType === EVENT_STORE_TYPE.DYNAMODB) {
            const dynamo = createDynamoDBClient(testManager.getDynamoDbOptions());
            try {
              const stateMap: Record<string, AttributeValue> = {};
              for (const [key, value] of Object.entries(state)) stateMap[key] = toAttribute(value);
              await dynamo.send(
                new PutItemCommand({
                  TableName: "snapshots",
                  Item: {
                    view_address: { S: `${STREAM_TYPE}::${streamId}::${viewName}` },
                    offset: { N: offset.toString() },
                    state: { M: { __state: { M: stateMap } } },
                    stored_at: { S: Date.now().toString() },
                  },
                }),
              );
            } finally {
              dynamo.destroy();
            }
            return;
          }
          assert.ok(storeClient, "relational store client expected");
          await storeClient.snapshot.create({
            data: {
              id: crypto.randomUUID(),
              stream_type: STREAM_TYPE,
              stream_id: streamId,
              view_name: viewName,
              offset,
              state: { ...state },
            },
          });
        };

        /** Views folded from the default state over every stored event, with no snapshots. */
        const fullReplay = async (streamId: string, lastOffset: number) => {
          const replay = await PointerRowsStreamFactory.goToOffset(streamId, lastOffset, adapter);
          return { Rare: replay.views.Rare, Count: replay.views.Count };
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
          await Steps.clearEnvironment(storeClient, storeType, testManager.getDynamoDbOptions());
        });

        const streamId = "pointer-rows-1";
        const lastOffset = 1 + TICKS;

        await t.test(
          "Given 20 Ticked events stored one per store, When the latest Rare row is read, Then its offset is the stream's last offset and its stateRef names the full row at Started",
          async () => {
            const stream = PointerRowsStreamFactory.create(streamId, adapter, adapter);
            await stream.appendEventStarted({ at: 1 });
            await stream.store();
            for (let n = 1; n <= TICKS; n++) {
              await stream.appendEventTicked({ n });
              await stream.store();
            }

            const rare = await adapter.getSnapshotAsync(
              new EvDbViewAddress(STREAM_TYPE, streamId, "Rare"),
            );
            assert.strictEqual(rare.offset, lastOffset);
            assert.deepStrictEqual(rare.stateRef, { kind: "row", offset: 1 });
            assert.deepStrictEqual(rare.state, { started: true, ended: false });

            const count = await adapter.getSnapshotAsync(
              new EvDbViewAddress(STREAM_TYPE, streamId, "Count"),
            );
            assert.strictEqual(count.offset, lastOffset);
            assert.deepStrictEqual(count.stateRef, { kind: "row", offset: lastOffset });
          },
        );

        await t.test(
          "Given that stream, When factory.get(), Then both views equal the views of a fresh full replay",
          async () => {
            const fetched = await PointerRowsStreamFactory.get(streamId, adapter, adapter);
            const expected = await fullReplay(streamId, lastOffset);
            assert.deepStrictEqual(
              { Rare: fetched.views.Rare, Count: fetched.views.Count },
              expected,
            );
            assert.deepStrictEqual(expected, {
              Rare: { started: true, ended: false },
              Count: { count: lastOffset },
            });
          },
        );

        await t.test(
          "Given rows only in the old snapshot table, When factory.get(), Then views equal a full replay and no error is thrown",
          async () => {
            const oldStreamId = "pointer-rows-old";
            // No snapshot adapter: events are stored, snapshot_v2 gets no rows.
            const stream = PointerRowsStreamFactory.create(oldStreamId, adapter);
            await stream.appendEventStarted({ at: 1 });
            await stream.appendEventTicked({ n: 1 });
            await stream.appendEventEnded({ at: 3 });
            await stream.store();
            // Wrong states on purpose: the old table must be ignored.
            await seedOldSnapshotTable(oldStreamId, "Rare", 3, { started: false, ended: false });
            await seedOldSnapshotTable(oldStreamId, "Count", 3, { count: 999 });

            const fetched = await PointerRowsStreamFactory.get(oldStreamId, adapter, adapter);
            const expected = await fullReplay(oldStreamId, 3);
            assert.deepStrictEqual(
              { Rare: fetched.views.Rare, Count: fetched.views.Count },
              expected,
            );
            assert.deepStrictEqual(expected, {
              Rare: { started: true, ended: true },
              Count: { count: 3 },
            });
          },
        );

        await t.after(async () => {
          await Steps.clearEnvironment(storeClient, storeType, testManager.getDynamoDbOptions());
        });
      });
    }
  });
});
