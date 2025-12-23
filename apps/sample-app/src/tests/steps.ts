import * as path from 'path';
import * as dotenv from 'dotenv';
import * as assert from 'node:assert';
import { fileURLToPath } from 'node:url';

import StorageAdapterStub from "./StorageAdapterStub.js";
import PointsStreamFactory, { PointsStreamType } from "../eventstore/PointsStream/index.js";
import { SumViewState, CountViewState } from '../eventstore/PointsStream/views.js';
import { PointsAdded, PointsMultiplied, PointsSubtracted } from "../eventstore/PointsStream/events.js";

import EvDbStream from "@eventualize/core/EvDbStream";
import { EvDbView } from '@eventualize/core/EvDbView';
import { EvDbPrismaStorageAdapter } from '@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter'
import { EvDbEventStoreBuilder, StreamMap, EvDbEventStoreType, IEvDbStorageAdapter } from '@eventualize/core/EvDbEventStore';
import EvDbPrismaStorageAdmin from '@eventualize/relational-storage-adapter/EvDBPrismaStorageAdmin';
import EvDbPostgresPrismaClientFactory from '@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory';
import EvDbMySqlPrismaClientFactory from '@eventualize/mysql-storage-adapter/EvDbMySqlPrismaClientFactory';
import { PrismaClient as PostgresPrismaClient } from '@eventualize/postgres-storage-adapter/generated/prisma/client';
import { PrismaClient as MySqlPrismaClient } from '@eventualize/mysql-storage-adapter/generated/prisma/client';
import EvDbDynamoDbStorageAdapter from '@eventualize/dynamodb-storage-adapter/EvDbDynamoDbStorageAdapter';
import EvDbDynamoDbAdmin from '@eventualize/dynamodb-storage-adapter/EvDbDynamoDbAdmin';
import IEvDbStorageAdmin from '@eventualize/types/IEvDbStorageAdmin';


const getEnvPath = () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const projectRoot = path.resolve(__dirname, '..', '..');
    return path.join(projectRoot, '.env')
}

const envPath = getEnvPath();
dotenv.config({ path: envPath });

export enum EVENT_STORE_TYPE {
    STUB = 'Stub',
    POSTGRES = 'Postgres',
    MYSQL = 'MySQL',
    DYNAMODB = 'DynamoDB'
}

type RelationalClientType = PostgresPrismaClient<never, any, any> | MySqlPrismaClient<never, any, any>;
type StoreClientType = RelationalClientType | undefined;

export default class Steps {
    public static createStoreClient(storeType: EVENT_STORE_TYPE = EVENT_STORE_TYPE.STUB): StoreClientType {
        switch (storeType) {
            case EVENT_STORE_TYPE.POSTGRES:
                return EvDbPostgresPrismaClientFactory.create();
            case EVENT_STORE_TYPE.MYSQL:
                return EvDbMySqlPrismaClientFactory.create();
            case EVENT_STORE_TYPE.DYNAMODB:
                return
            case EVENT_STORE_TYPE.STUB:
            default:
                return undefined;
        }
    }
    public static createEventStore(storeClient: StoreClientType, storeType: EVENT_STORE_TYPE) {
        const storageAdapter = [EVENT_STORE_TYPE.POSTGRES, EVENT_STORE_TYPE.MYSQL].includes(storeType) ? new EvDbPrismaStorageAdapter(storeClient) :
            storeType === EVENT_STORE_TYPE.DYNAMODB ? new EvDbDynamoDbStorageAdapter() :
                new StorageAdapterStub();

        const eventstore = new EvDbEventStoreBuilder()
            .withAdapter(storageAdapter)
            .withStreamFactory(PointsStreamFactory)
            .build();

        return eventstore;

    }

    public static createPointsStream<TStreams extends StreamMap>(streamId: string, eventStore: EvDbEventStoreType<TStreams>): PointsStreamType {
        return eventStore.createPointsStream(streamId) as PointsStreamType;
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
        if (!sumView)
            assert.fail('SumView not found in stream');
        const countView = stream.views.Count;
        if (!countView)
            assert.fail('CountView not found in stream');
        assert.strictEqual((stream.views.Sum as EvDbView<SumViewState>).getState().sum, 210);
        assert.strictEqual((stream.views.Count as EvDbView<CountViewState>).getState().count, 11);
        assert.strictEqual(stream.getEvents().length, 11);
    }

    public static compareFetchedAndStoredStreams(storedStream: PointsStreamType, fetchedStream: PointsStreamType) {
        assert.strictEqual(fetchedStream.getEvents().length, 0);
        assert.strictEqual(fetchedStream.storedOffset, storedStream.storedOffset);
        const fetchedSumView = fetchedStream.views.Sum as EvDbView<SumViewState>;
        const storedSumView = storedStream.views.Sum as EvDbView<SumViewState>;
        assert.strictEqual(storedSumView.getState().sum, fetchedSumView.getState().sum);
        assert.strictEqual(storedSumView.storeOffset, fetchedSumView.memoryOffset);
    }

    public static async clearEnvironment(storeClient: StoreClientType, storeType: EVENT_STORE_TYPE = EVENT_STORE_TYPE.STUB) {
        let admin: IEvDbStorageAdmin;
        switch (storeType) {
            case EVENT_STORE_TYPE.POSTGRES:
            case EVENT_STORE_TYPE.MYSQL:
                admin = new EvDbPrismaStorageAdmin(storeClient);
                break;
            case EVENT_STORE_TYPE.DYNAMODB:
                admin = new EvDbDynamoDbAdmin();
                break;
            case EVENT_STORE_TYPE.STUB:
            default:
                return;
        }
        await admin.clearEnvironmentAsync();
        await admin.close();
    }
}