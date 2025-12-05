import IEvDbViewStore from "./IEvDbViewStore";

class EvDbViewsSet<TViews extends IEvDbViewStore> {
    private readonly _views: ReadonlyArray<IEvDbViewStore>;
    private readonly I
    [E in TEvents as `apply${E['address']}`]: (event: E, capturedBy?: string) => Promise<IEvDbEventMetadata>;
};

export default IEvDbViewsSet;