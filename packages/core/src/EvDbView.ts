import IEvDbViewStore, { IEvDbViewStoreGeneric } from "@eventualize/types/IEvDbViewStore";
import EvDbViewAddress from "@eventualize/types/EvDbViewAddress";
import IEvDbStorageSnapshotAdapter from "@eventualize/types/IEvDbStorageSnapshotAdapter";
import EvDbEvent from "@eventualize/types/src/EvDbEvent";
import { EvDbStoredSnapshotData } from "@eventualize/types/EvDbStoredSnapshotData";
import { EvDbStoredSnapshotResult } from "@eventualize/types/EvDbStoredSnapshotResult";
import IEvDbEventMetadata from "@eventualize/types/IEvDbEventMetadata";
import IEvDbEventPayload from "@eventualize/types/IEvDbEventPayload";


export abstract class EvDbViewRaw implements IEvDbViewStore {

    protected constructor(
        public readonly address: EvDbViewAddress,
        public readonly storedAt: Date = new Date(),
        public storeOffset: number = 0,
        private _memoryOffset: number = 0,
        private readonly _storageAdapter: IEvDbStorageSnapshotAdapter,

    ) {
    }
    public abstract getSnapshotData(): EvDbStoredSnapshotData;

    get memoryOffset(): number { return this._memoryOffset };

    shouldStoreSnapshot(offsetGapFromLastSave: number, durationSinceLastSaveMs: number): boolean {
        return true;
    }
    applyEvent(e: EvDbEvent): void {
        const offset = e.streamCursor.offset;
        if (this.memoryOffset >= offset) {
            return;
        }
        this.onApplyEvent(e);
        this._memoryOffset = offset;
    }

    async store(): Promise<void> {
        const eventsSinceLatestSnapshot = this.memoryOffset - this.storeOffset;
        const secondsSinceLatestSnapshot = new Date().getTime() - this.storedAt.getTime();
        if (!this.shouldStoreSnapshot(eventsSinceLatestSnapshot, secondsSinceLatestSnapshot)) {
            return;
        }
        const snapshotData = this.getSnapshotData();
        await this._storageAdapter.storeSnapshotAsync(snapshotData);
    }

    protected abstract onApplyEvent(e: EvDbEvent): void;
}

export abstract class EvDbView<TState> extends EvDbViewRaw implements IEvDbViewStoreGeneric<TState> {
    protected getDefaultState(): TState {
        return this.defaultState;
    };
    protected state: TState = this.getDefaultState();
    public getState(): TState {
        return this.state;
    }

    public constructor(
        address: EvDbViewAddress,
        storedAt: Date = new Date(),
        storeOffset: number = 0,
        memoryOffset: number = 0,
        storageAdapter: IEvDbStorageSnapshotAdapter,
        snapshot: EvDbStoredSnapshotResult<TState>,
        public readonly defaultState: TState
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

    public abstract handleOnApply(oldState: TState, event: IEvDbEventPayload, metadata: IEvDbEventMetadata): TState

    protected onApplyEvent(e: EvDbEvent): void {
        this.state = this.handleOnApply(this.state, e.payload, e);
    }

}