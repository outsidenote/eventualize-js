import EvDbPrismaStorageAdapter from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import { EVENT_STORE_TYPE } from "./EVENT_STORE_TYPE.js";
import EvDbDynamoDbStorageAdapter from "@eventualize/dynamodb-storage-adapter/EvDbDynamoDbStorageAdapter";
import StorageAdapterStub from "./StorageAdapterStub.js";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import EvDbMySqlPrismaClientFactory from "@eventualize/mysql-storage-adapter/EvDbMySqlPrismaClientFactory";
import type { PrismaClient } from "@prisma/client/extension";
import type { DynamoDBClientOptions } from "@eventualize/dynamodb-storage-adapter/DynamoDbClient";

export default class Helpers {
  /**
   * Creates an event store with the specified storage adapter.
   * @param storeClient - The Prisma client for relational databases (or undefined for DynamoDB/Stub).
   */
  public static createEventStore(
    storeType: EVENT_STORE_TYPE,
    options?: DynamoDBClientOptions | PrismaClient | undefined,
  ): IEvDbStorageStreamAdapter & IEvDbStorageSnapshotAdapter {
    let storageAdapter: IEvDbStorageStreamAdapter & IEvDbStorageSnapshotAdapter;
    if ([EVENT_STORE_TYPE.POSTGRES, EVENT_STORE_TYPE.MYSQL].includes(storeType)) {
      storageAdapter = new EvDbPrismaStorageAdapter(options);
    } else if (storeType === EVENT_STORE_TYPE.DYNAMODB) {
      storageAdapter = EvDbDynamoDbStorageAdapter.withOptions(options ?? {});
    } else {
      storageAdapter = new StorageAdapterStub();
    }

    return storageAdapter;
  }

  public static createStoreClient(
    storeType: EVENT_STORE_TYPE = EVENT_STORE_TYPE.STUB,
    connectionString?: string,
  ): PrismaClient | undefined {
    let result: PrismaClient | undefined = undefined;
    switch (storeType) {
      case EVENT_STORE_TYPE.POSTGRES:
        result = EvDbPostgresPrismaClientFactory.create(connectionString);
        break;
      case EVENT_STORE_TYPE.MYSQL:
        result = EvDbMySqlPrismaClientFactory.create(connectionString);
        break;
      case EVENT_STORE_TYPE.DYNAMODB:
      case EVENT_STORE_TYPE.STUB:
      default:
        break;
    }
    return result;
  }
}
