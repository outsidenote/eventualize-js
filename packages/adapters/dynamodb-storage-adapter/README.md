# @eventualize/dynamodb-storage-adapter

DynamoDB storage adapter for
[eventualize-js](https://github.com/outsidenote/eventualize-js). It stores
events, outbox messages and view snapshots.

## Install

```bash
pnpm add @eventualize/dynamodb-storage-adapter @aws-sdk/client-dynamodb
```

`@aws-sdk/client-dynamodb` is a peer dependency (`^3.1111.0`).

## Usage

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import EvDbDynamoDbStorageAdapter from "@eventualize/dynamodb-storage-adapter/EvDbDynamoDbStorageAdapter";

// AWS: your own client, normal credential chain
const storage = new EvDbDynamoDbStorageAdapter(new DynamoDBClient({ region: "eu-west-1" }));

// Local (e.g. LocalStack)
const local = EvDbDynamoDbStorageAdapter.withOptions({
  endpoint: "http://localhost:4566",
  accessKeyId: "local",
  secretAccessKey: "local",
});

const stream = await MyStreamFactory.get("id-1", storage, storage);
```

## Tables

`events`, `snapshot_v2` and `messages`. `CreateTable` inputs are in
[`models/`](https://github.com/outsidenote/eventualize-js/tree/main/packages/adapters/dynamodb-storage-adapter/models).
`snapshots` is the snapshot table of older SDK versions. This version does not use it.

## Upgrading from the `snapshots` table

This version writes snapshots to `snapshot_v2`. Roll out in this order:

1. Create `snapshot_v2` from `models/snapshot_v2-table-schema.json`.
2. Deploy the new version.
3. Copy the latest snapshot of each view:

   ```ts
   import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
   import { copySnapshotsToV2 } from "@eventualize/dynamodb-storage-adapter/copySnapshotsToV2";

   const { views, copied } = await copySnapshotsToV2(new DynamoDBClient({ region: "eu-west-1" }));
   ```

   It never overwrites a row in `snapshot_v2`, so you can run it again. Its scan is
   eventually consistent: if the app was running, run it again after the rollout.
4. Retire every service on an older SDK version.
5. Only then delete the `snapshots` table.

See [Snapshot rows and `snapshot_v2`](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md#snapshot-rows-and-snapshot_v2).

One `store()` is one DynamoDB transaction, so it can write at most 100 items
(events + messages).

## Docs

[Storage adapters guide](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md#dynamodb)

## License

MIT
