import * as assert from 'node:assert';
import StorageAdapterStub from "./StorageAdapterStub.js";
import PointsStreamFactory from "../eventstore/PointsStream/index.js";
import { PointsAdded, PointsSubtracted } from "../eventstore/PointsStream/events.js";
import EvDbStream from "@eventualize/types/EvDbStream";
import { EvDbView } from '@eventualize/core/EvDbView';
import { SumViewState, CountViewState } from '../eventstore/PointsStream/views.js';
import { EvDbEventStoreBuilder, StreamMap, EvDbEventStoreType, IEvDbStorageAdapter } from '@eventualize/core/EvDbEventStore';
import { EvDbPrismaStorageAdapter } from '@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter'
import { PrismaClient } from '@eventualize/relational-storage-adapter/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'node:url';


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
    POSTGRES
}

export default class Steps {
    public static createEventStore(eventStoreType: EVENT_STORE_TYPE = EVENT_STORE_TYPE.STUB) {
        let storageAdapter: IEvDbStorageAdapter;
        switch (eventStoreType) {
            case EVENT_STORE_TYPE.POSTGRES: {
                const connectionString = `${process.env.DATABASE_URL}`
                const adapter = new PrismaPg({ connectionString })
                const client = new PrismaClient({ adapter })
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
}