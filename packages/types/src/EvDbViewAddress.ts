import EvDbStreamAddress from "@eventualize/types/EvDbStreamAddress";

export default class EvDbViewAddress extends EvDbStreamAddress {
    public readonly viewName: string;
    constructor(streamAddressOrType: EvDbStreamAddress | string, viewNameOrStreamId: string, viewName?: string) {
        if (streamAddressOrType instanceof EvDbStreamAddress &&
            typeof viewNameOrStreamId === "string" &&
            !viewName
        ) {
            const streamAddress = streamAddressOrType as EvDbStreamAddress;
            super(streamAddress.streamType, streamAddress.streamId);
            this.viewName = viewNameOrStreamId;
            return;
        }
        if (typeof streamAddressOrType === 'string' &&
            typeof viewNameOrStreamId === 'string' &&
            typeof viewName === 'string'
        ) {
            super(streamAddressOrType, viewNameOrStreamId);
            this.viewName = viewName;
            return;
        }
        throw new Error('Unsupported set or arguments')

    }
}