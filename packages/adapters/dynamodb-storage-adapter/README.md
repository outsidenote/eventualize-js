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

`events`, `snapshots` and `messages`. `CreateTable` inputs are in
[`models/`](https://github.com/outsidenote/eventualize-js/tree/main/packages/adapters/dynamodb-storage-adapter/models).

One `store()` is one DynamoDB transaction, so it can write at most 100 items
(events + messages).

## Docs

[Storage adapters guide](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md#dynamodb)

## License

MIT
