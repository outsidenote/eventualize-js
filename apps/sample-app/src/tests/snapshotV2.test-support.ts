import * as assert from "node:assert";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import type EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import { createDynamoDBClient } from "@eventualize/dynamodb-storage-adapter/DynamoDbClient";
import type { DynamoDBClientOptions } from "@eventualize/dynamodb-storage-adapter/DynamoDbClient";
import { EVENT_STORE_TYPE } from "./EVENT_STORE_TYPE.js";
import type Steps from "./steps.js";

type StoreClientType = ReturnType<typeof Steps.createStoreClient>;

// Databases whose adapter implements snapshot_v2 pointer rows.
export const SNAPSHOT_V2_DATABASES: EVENT_STORE_TYPE[] = [
  EVENT_STORE_TYPE.POSTGRES,
  EVENT_STORE_TYPE.MYSQL,
  EVENT_STORE_TYPE.DYNAMODB,
];

// Writes a full row at `offset` for `address` into the old snapshot table.
export async function seedOldSnapshotTable(
  storeType: EVENT_STORE_TYPE,
  storeClient: StoreClientType,
  dynamoDbOptions: DynamoDBClientOptions | undefined,
  address: EvDbViewAddress,
  offset: number,
): Promise<void> {
  if (storeType === EVENT_STORE_TYPE.DYNAMODB) {
    const dynamo = createDynamoDBClient(dynamoDbOptions);
    await dynamo.send(
      new PutItemCommand({
        TableName: "snapshots",
        Item: {
          view_address: {
            S: `${address.streamType}::${address.streamId}::${address.viewName}`,
          },
          offset: { N: offset.toString() },
          state: { M: { __state: { M: { sum: { N: "1" } } } } },
          stored_at: { S: Date.now().toString() },
        },
      }),
    );
    return;
  }
  assert.ok(storeClient, "relational store client expected");
  await storeClient.snapshot.create({
    data: {
      id: crypto.randomUUID(),
      stream_type: address.streamType,
      stream_id: address.streamId,
      view_name: address.viewName,
      offset,
      state: { sum: 1 },
    },
  });
}
