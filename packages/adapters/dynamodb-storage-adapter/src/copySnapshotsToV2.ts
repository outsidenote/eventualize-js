import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import {
  ConditionalCheckFailedException,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const OLD_TABLE = "snapshots";
const NEW_TABLE = "snapshot_v2";

/**
 * Copies the latest snapshot of every view from the old `snapshots` table into
 * `snapshot_v2`, as full rows (`state_offset` equals `offset`).
 * Safe to run again: a row that already exists in `snapshot_v2` is skipped.
 * The old table is not changed.
 * @param client - A DynamoDB client.
 * @returns `views`: views found in the old table. `copied`: rows written to `snapshot_v2`.
 */
export async function copySnapshotsToV2(
  client: DynamoDBClient,
): Promise<{ readonly views: number; readonly copied: number }> {
  const latestOffsets = await findLatestOffsets(client);
  let copied = 0;
  for (const [viewAddress, offset] of latestOffsets) {
    const key = { view_address: { S: viewAddress }, offset: { N: offset.toString() } };
    const { Item } = await client.send(
      new GetItemCommand({ TableName: OLD_TABLE, Key: key, ConsistentRead: true }),
    );
    if (!Item) continue;
    try {
      await client.send(
        new PutItemCommand({
          TableName: NEW_TABLE,
          Item: { ...Item, state_offset: { N: offset.toString() } },
          ConditionExpression: "attribute_not_exists(view_address)",
        }),
      );
      copied++;
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
    }
  }
  return { views: latestOffsets.size, copied };
}

async function findLatestOffsets(client: DynamoDBClient): Promise<Map<string, number>> {
  const latest = new Map<string, number>();
  let startKey: Record<string, AttributeValue> | undefined;
  do {
    const page = await client.send(
      new ScanCommand({
        TableName: OLD_TABLE,
        ProjectionExpression: "view_address, #o",
        ExpressionAttributeNames: { "#o": "offset" },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of page.Items ?? []) {
      const viewAddress = item.view_address?.S;
      const offsetText = item.offset?.N;
      if (viewAddress === undefined || offsetText === undefined) continue;
      const offset = Number(offsetText);
      const known = latest.get(viewAddress);
      if (known === undefined || offset > known) latest.set(viewAddress, offset);
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return latest;
}
