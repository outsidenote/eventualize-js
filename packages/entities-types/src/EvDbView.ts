import IEvDbViewStore, { IEvDbViewStoreGeneric } from "./IEvDbViewStore.js";
import EvDbViewAddress from "./EvDbViewAddress.js";
import IEvDbStorageSnapshotAdapter from "./IEvDbStorageSnapshotAdapter.js";
import EvDbEvent from "./EvDbEvent.js";
import { EvDbStoredSnapshotData } from "./EvDbStoredSnapshotData.js";
import { EvDbStoredSnapshotResult } from "./EvDbStoredSnapshotResult.js";
import IEvDbEventsSet from "./IEvDbEventsSet.js";
import IEvDbEventMetadata from "./IEvDbEventMetadata.js";
import IEvDbEventPayload from "./IEvDbEventPayload.js";


export abstract class EvDbViewRaw implements IEvDbViewStore {

    protected constructor(
        public readonly address: EvDbViewAddress,
        public readonly storedAt: Date = new Date(),
        public storeOffset: number = 0,
        readonly memoryOffset: number = 0,
        private readonly _storageAdapter: IEvDbStorageSnapshotAdapter,

    ) {
    }
    public abstract getSnapshotData(): EvDbStoredSnapshotData;

    shouldStoreSnapshot(offsetGapFromLastSave: number, durationSinceLastSaveMs: number): boolean {
        return true;
    }
    applyEvent(e: EvDbEvent): void {
        const offset = e.streamCursor.offset;
        if (this.memoryOffset >= offset)
            return;
        this.onApplyEvent(e);
        this.memoryOffset
    }

    save(signal?: AbortSignal): Promise<void> {
        throw new Error("Method not implemented.");
    }

    protected abstract onApplyEvent(e: EvDbEvent): void;
}

type ApplyMethodType<TState> = (oldState: TState, payload: IEvDbEventPayload, metadata: IEvDbEventMetadata) => TState;


export abstract class EvDbView<TState> extends EvDbViewRaw implements IEvDbViewStoreGeneric<TState> {
    protected abstract getDefaultState(): TState;
    protected state: TState = this.getDefaultState();
    public getState(): TState {
        return this.state;
    }

    protected constructor(
        address: EvDbViewAddress,
        storedAt: Date = new Date(),
        storeOffset: number = 0,
        memoryOffset: number = 0,
        storageAdapter: IEvDbStorageSnapshotAdapter,
        snapshot: EvDbStoredSnapshotResult<TState>
    ) {
        super(address, storedAt, storeOffset, memoryOffset, storageAdapter);
        if (snapshot.offset === 0)
            this.state = this.getDefaultState();
        else
            this.state = snapshot.state;


    }

    getSnapshotData(): EvDbStoredSnapshotData {
        return EvDbStoredSnapshotData.fromAddress(
            this.address,
            this.memoryOffset,
            this.storeOffset,
            this.state
        );
    }

    protected onApplyEvent(e: EvDbEvent): void {
        const methodName = `apply${[e.payload.payloadType]}`;
        const method = (this as any)[methodName] as ApplyMethodType<TState>;
        if (typeof method === 'function') {
            const newState = method(this.state, e.payload, e);
            this.state = newState;
        } else {
            throw new Error(`Method '${methodName}' not found or not a function in the child class.`);
        }



    }

}