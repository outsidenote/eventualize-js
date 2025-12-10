import * as path from 'path';
import * as dotenv from 'dotenv';
import * as assert from 'node:assert';
import { fileURLToPath } from 'node:url';

import StorageAdapterStub from "./StorageAdapterStub.js";
import PointsStreamFactory from "../eventstore/PointsStream/index.js";
import { SumViewState, CountViewState } from '../eventstore/PointsStream/views.js';
import { PointsAdded, PointsSubtracted } from "../eventstore/PointsStream/events.js";

import { PrismaPg } from '@prisma/adapter-pg'
import EvDbStream from "@eventualize/types/EvDbStream";
import { EvDbView } from '@eventualize/core/EvDbView';
import { EvDbPrismaStorageAdapter } from '@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter'
import { EvDbEventStoreBuilder, StreamMap, EvDbEventStoreType, IEvDbStorageAdapter } from '@eventualize/core/EvDbEventStore';
import EvDbPrismaStorageAdmin from '@eventualize/relational-storage-adapter/EvDBPrismaStorageAdmin';
import { EvDbEventStore } from '@eventualize/core/EvDbEventStore'
import EvDbPostgresPrismaClientFactory from '@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory';
import EvDbMySqlPrismaClientFactory from '@eventualize/mysql-storage-adapter/EvDbMySqlPrismaClientFactory';


const getEnvPath = () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const projectRoot = path.resolve(__dirname, '..', '..');
    return path.join(projectRoot, '.env')
}

const envPath = getEnvPath();
dotenv.config({ path: envPath });

export enum EVENT_STORE_TYPE {
    STUB,
    POSTGRES,
    MYSQL
}

export default class Steps {
    public static createEventStore(eventStoreType: EVENT_STORE_TYPE = EVENT_STORE_TYPE.STUB) {
        let storageAdapter: IEvDbStorageAdapter;
        switch (eventStoreType) {
            case EVENT_STORE_TYPE.POSTGRES: {
                const client = EvDbPostgresPrismaClientFactory.create();
                storageAdapter = new EvDbPrismaStorageAdapter(client)
                break;
            }
            case EVENT_STORE_TYPE.MYSQL: {
                const client = EvDbMySqlPrismaClientFactory.create();
                storageAdapter = new EvDbPrismaStorageAdapter(client)
                break;
            }
            case EVENT_STORE_TYPE.STUB:
            default:
                storageAdapter = new StorageAdapterStub();
                break;
        }
        const eventstore = new EvDbEventStoreBuilder()
            .withAdapter(storageAdapter)
            .withStreamFactory(PointsStreamFactory)
            .build();

        return eventstore;

    }

    public static createPointsStream<TStreams extends StreamMap>(streamId: string, eventStore: EvDbEventStoreType<TStreams>): EvDbStream {
        return eventStore.createPointsStream(streamId);
    }

    public static addPointsEventsToStream(stream: EvDbStream) {
        stream.appendEvent(new PointsAdded(50));
        stream.appendEvent(new PointsSubtracted(20));
    }
    public static assertStreamStateIsCorrect(stream: EvDbStream) {
        const sumView = stream.getView('SumView');
        if (!sumView)
            assert.fail('SumView not found in stream');
        const countView = stream.getView('CountView');
        if (!countView)
            assert.fail('CountView not found in stream');
        assert.strictEqual((stream.getView('SumView') as EvDbView<SumViewState>).getState().sum, 30);
        assert.strictEqual((stream.getView('CountView') as EvDbView<CountViewState>).getState().count, 2);
        assert.strictEqual(stream.getEvents().length, 2);
    }

    public static compareFetchedAndStoredStreams(storedStream: EvDbStream, fetchedStream: EvDbStream) {
        assert.strictEqual(fetchedStream.getEvents().length, 0);
        assert.strictEqual(fetchedStream.storedOffset, storedStream.storedOffset);
        const fetchedSumView = fetchedStream.getView('SumView') as EvDbView<SumViewState>;
        const storedSumView = storedStream.getView('SumView') as EvDbView<SumViewState>;
        assert.strictEqual(storedSumView.getState().sum, fetchedSumView.getState().sum);
        assert.strictEqual(storedSumView.storeOffset, fetchedSumView.memoryOffset);
    }

    public static async clearEnvironment(eventStore: EvDbEventStore<any>, eventStoreType: EVENT_STORE_TYPE = EVENT_STORE_TYPE.POSTGRES) {
        if ([EVENT_STORE_TYPE.POSTGRES, EVENT_STORE_TYPE.MYSQL].includes(eventStoreType)) {
            const client = EvDbPostgresPrismaClientFactory.create();
            const admin = new EvDbPrismaStorageAdmin(client);
            await eventStore.getStore().close();
            await admin.clearEnvironmentAsync();
            await admin.close();
        }
    }
}