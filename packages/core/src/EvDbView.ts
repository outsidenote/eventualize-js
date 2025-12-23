import IEvDbViewStore, { IEvDbViewStoreGeneric } from "@eventualize/types/IEvDbViewStore";
import EvDbViewAddress from "@eventualize/types/EvDbViewAddress";
import IEvDbStorageSnapshotAdapter from "@eventualize/types/IEvDbStorageSnapshotAdapter";
import EvDbEvent from "@eventualize/types/src/EvDbEvent";
import { EvDbStoredSnapshotData } from "@eventualize/types/EvDbStoredSnapshotData";
import { EvDbStoredSnapshotResult } from "@eventualize/types/EvDbStoredSnapshotResult";
import IEvDbEventMetadata from "@eventualize/types/IEvDbEventMetadata";
import IEvDbEventPayload from "@eventualize/types/IEvDbEventPayload";


export abstract class EvDbViewRaw implements IEvDbViewStore {
    private _memoryOffset: number;
    private _storeOffset: number;
    private _storedAt: Date;

    protected constructor(
        private readonly _storageAdapter: IEvDbStorageSnapshotAdapter,
        public readonly address: EvDbViewAddress,
        snapshot: EvDbStoredSnapshotResult<any>

    ) {
        const storeOffset = snapshot.offset ?? 0;
        this._memoryOffset = storeOffset;
        this._storeOffset = storeOffset;

        this._storedAt = snapshot.storedAt ?? new Date();
    }
    public abstract getSnapshotData(): EvDbStoredSnapshotData;

    get storedAt(): Date { return this._storedAt };
    get storeOffset(): number { return this._storeOffset };
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
        this._storeOffset = this._memoryOffset;
    }

    protected abstract onApplyEvent(e: EvDbEvent): void;
}

export abstract class EvDbView<TState> extends EvDbViewRaw implements IEvDbViewStoreGeneric<TState> {
    protected getDefaultState(): TState {
        return this.defaultState;
    };
    protected _state: TState = this.getDefaultState();
    get state(): TState { return this._state }
    // public getState(): TState {
    //     return this._state;
    // }

    public constructor(
        address: EvDbViewAddress,
        storageAdapter: IEvDbStorageSnapshotAdapter,
        snapshot: EvDbStoredSnapshotResult<TState>,
        public readonly defaultState: TState
    ) {
        super(storageAdapter, address, snapshot);
        if (snapshot.offset === 0)
            this._state = this.getDefaultState();
        else
            this._state = snapshot.state;


    }

    getSnapshotData(): EvDbStoredSnapshotData {
        return EvDbStoredSnapshotData.fromAddress(
            this.address,
            this.memoryOffset,
            this.storeOffset,
            this._state
        );
    }

    public abstract handleOnApply(oldState: TState, event: IEvDbEventPayload, metadata: IEvDbEventMetadata): TState

    protected onApplyEvent(e: EvDbEvent): void {
        this._state = this.handleOnApply(this._state, e.payload, e);
    }

}