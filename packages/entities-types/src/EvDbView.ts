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
        // const handlerName = [e.payload.payloadType];
        // const method = (this as any)[methodName] as ApplyMethodType<TState>;
        // if (typeof method === 'function') {
        //     const newState = method(this.state, e.payload, e);
        //     this.state = newState;
        // } else {
        //     throw new Error(`Method '${methodName}' not found or not a function in the child class.`);
        // }

    }

}