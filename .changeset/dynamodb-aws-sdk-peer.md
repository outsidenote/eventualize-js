---
"@eventualize/dynamodb-storage-adapter": major
---

`@aws-sdk/client-dynamodb` is now a peer dependency (`>=3.1111.0`) instead of a regular dependency.

`EvDbDynamoDbStorageAdapter` accepts a `DynamoDBClient` that your app creates. As a peer, your app and the adapter now share one copy of the AWS SDK client, so the types always match. The range has no upper limit, so newer SDK versions do not cause install conflicts.

Migration: if your package manager does not install peers automatically, add the client to your app:

    pnpm add @aws-sdk/client-dynamodb
