import IEvDbViewStore, { IEvDbViewStoreGeneric } from "./IEvDbViewStore";
import EvDbViewAddress from "./EvDbViewAddress";
import IEvDbStorageSnapshotAdapter from "./IEvDbStorageSnapshotAdapter";
import EvDbEvent from "./EvDbEvent";
import { EvDbStoredSnapshotData } from "./EvDbStoredSnapshotData";
import { EvDbStoredSnapshotResult } from "./EvDbStoredSnapshotResult";
import IEvDbEventsSet from "./IEvDbEventsSet";


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

    protected onApplyEvent(e: EvDbEvent): void {
        const methodName = `apply${[e.payload.payloadType]}`;
        const method = (this as any)[methodName];
        if (typeof method === 'function') {
            method();
        } else {
            throw new Error(`Method '${methodName}' not found or not a function in the child class.`);
        }



    }
}


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

}