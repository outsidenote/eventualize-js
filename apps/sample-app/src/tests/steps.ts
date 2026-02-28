import * as path from "path";
import * as dotenv from "dotenv";
import * as assert from "node:assert";
import { fileURLToPath } from "node:url";

import StorageAdapterStub from "./StorageAdapterStub.js";
import type { PointsStreamType } from "../eventstore/PointsStream/PointsStreamFactory.js";
import PointsStreamFactory from "../eventstore/PointsStream/PointsStreamFactory.js";
import type { SumViewState } from "../eventstore/PointsStream/PointsViews/SumViewState.js";
import type { CountViewState } from "../eventstore/PointsStream/PointsViews/CountViewState.js";
import { PointsAdded } from "../eventstore/PointsStream/PointsEvents/PointsAdded.js";
import { PointsMultiplied } from "../eventstore/PointsStream/PointsEvents/PointsMultiplied.js";
import { PointsSubtracted } from "../eventstore/PointsStream/PointsEvents/PointsSubtracted.js";

import type { EvDbView } from "@eventualize/core/view/EvDbView";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter.js";
import EvDbPrismaStorageAdmin from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdmin.js";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory.js";
import EvDbMySqlPrismaClientFactory from "@eventualize/mysql-storage-adapter/EvDbMySqlPrismaClientFactory.js";
import type { PrismaClient as PostgresPrismaClient } from "@eventualize/postgres-storage-adapter/generated/prisma/client.js";
import type { PrismaClient as MySqlPrismaClient } from "@eventualize/mysql-storage-adapter/generated/prisma/client.js";
import EvDbDynamoDbStorageAdapter from "@eventualize/dynamodb-storage-adapter/EvDbDynamoDbStorageAdapter.js";
import EvDbDynamoDbAdmin from "@eventualize/dynamodb-storage-adapter/EvDBDynamoDBAdmin.js";
import type IEvDbStorageAdmin from "@eventualize/types/adapters/IEvDbStorageAdmin";
import type { DynamoDBClientOptions } from "./DynamoDBClientOptions.js";
import { EVENT_STORE_TYPE } from "./EVENT_STORE_TYPE.js";
import { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

const getEnvPath = () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, "..", "..");
  return path.join(projectRoot, ".env");
};

const envPath = getEnvPath();
dotenv.config({ path: envPath });

type RelationalClientType =
  | PostgresPrismaClient<never, any, any>
  | MySqlPrismaClient<never, any, any>;
type StoreClientType = RelationalClientType | undefined;

export default class Steps {
  /**
   * Creates a store client for the specified database type.
   * @param storeType - The type of database to use.
   * @param connectionString - Optional connection string. Falls back to env vars if not provided.
   */
  public static createStoreClient(
    storeType: EVENT_STORE_TYPE = EVENT_STORE_TYPE.STUB,
    connectionString?: string,
  ): StoreClientType {
    switch (storeType) {
      case EVENT_STORE_TYPE.POSTGRES:
        return EvDbPostgresPrismaClientFactory.create(connectionString);
      case EVENT_STORE_TYPE.MYSQL:
        return EvDbMySqlPrismaClientFactory.create(connectionString);
      case EVENT_STORE_TYPE.DYNAMODB:
        return undefined;
      case EVENT_STORE_TYPE.STUB:
      default:
        return undefined;
    }
  }

  public static createStorageAdapter(storeType: EVENT_STORE_TYPE, storeClient: StoreClientType, dynamoDbOptions: DynamoDBClientOptions | undefined): IEvDbStorageAdapter {
    return [EVENT_STORE_TYPE.POSTGRES, EVENT_STORE_TYPE.MYSQL].includes(storeType)
      ? new EvDbPrismaStorageAdapter(storeClient as any)
      : storeType === EVENT_STORE_TYPE.DYNAMODB
        ? EvDbDynamoDbStorageAdapter.withOptions(dynamoDbOptions ?? {})
        : new StorageAdapterStub();
  }

  public static createPointsStream(
    streamId: string,
    storageAdapter: IEvDbStorageAdapter,
  ): PointsStreamType {
    return PointsStreamFactory.create(streamId, storageAdapter, storageAdapter) as PointsStreamType;
  }

  public static addPointsEventsToStream(stream: PointsStreamType) {
    stream.appendEventPointsAdded(new PointsAdded(50));
    stream.appendEventPointsSubtracted(new PointsSubtracted(20));
    stream.appendEventPointsAdded(new PointsAdded(50));
    stream.appendEventPointsSubtracted(new PointsSubtracted(20));
    stream.appendEventPointsMultiplied(new PointsMultiplied(2));
    stream.appendEventPointsAdded(new PointsAdded(50));
    stream.appendEventPointsSubtracted(new PointsSubtracted(20));
    stream.appendEventPointsAdded(new PointsAdded(50));
    stream.appendEventPointsSubtracted(new PointsSubtracted(20));
    stream.appendEventPointsAdded(new PointsAdded(50));
    stream.appendEventPointsSubtracted(new PointsSubtracted(20));
  }
  public static assertStreamStateIsCorrect(stream: PointsStreamType) {
    const sumView = stream.views.Sum;
    if (!sumView) assert.fail("SumView not found in stream");
    const countView = stream.views.Count;
    if (!countView) assert.fail("CountView not found in stream");
    assert.strictEqual((stream.views.Sum as EvDbView<SumViewState>).state.sum, 210);
    assert.strictEqual((stream.views.Count as EvDbView<CountViewState>).state.count, 11);
    assert.strictEqual(stream.getEvents().length, 11);
  }

  public static compareFetchedAndStoredStreams(
    storedStream: PointsStreamType,
    fetchedStream: PointsStreamType,
  ) {
    assert.strictEqual(fetchedStream.getEvents().length, 0);
    assert.strictEqual(fetchedStream.storedOffset, storedStream.storedOffset);
    const fetchedSumView = (fetchedStream as PointsStreamType).views.Sum as EvDbView<SumViewState>;
    const storedSumView = storedStream.views.Sum as EvDbView<SumViewState>;
    assert.strictEqual(storedSumView.state.sum, fetchedSumView.state.sum);
    assert.strictEqual(storedSumView.storeOffset, fetchedSumView.memoryOffset);
  }

  /**
   * Clears the test environment (deletes all data from tables).
   * @param storeClient - The Prisma client for relational databases.
   * @param storeType - The type of database.
   * @param dynamoDbOptions - Optional DynamoDB configuration for testcontainers.
   */
  public static async clearEnvironment(
    storeClient: StoreClientType,
    storeType: EVENT_STORE_TYPE = EVENT_STORE_TYPE.STUB,
    dynamoDbOptions?: DynamoDBClientOptions,
  ) {
    let admin: IEvDbStorageAdmin;
    switch (storeType) {
      case EVENT_STORE_TYPE.POSTGRES:
      case EVENT_STORE_TYPE.MYSQL:
        admin = new EvDbPrismaStorageAdmin(storeClient);
        break;
      case EVENT_STORE_TYPE.DYNAMODB:
        admin = new EvDbDynamoDbAdmin(dynamoDbOptions);
        break;
      case EVENT_STORE_TYPE.STUB:
      default:
        return;
    }
    await admin.clearEnvironmentAsync();
    await admin.close();
  }
}


