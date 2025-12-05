import DelayStrategy from "./DelayStrategy";

export default class EvDbContinuousFetchOptions {
    private static readonly MAX_DELAY_SEC = 3;

    static readonly CompleteIfEmpty = new EvDbContinuousFetchOptions({
        completeWhenEmpty: true
    });

    static readonly ContinueWhenEmpty = new EvDbContinuousFetchOptions();

    completeWhenEmpty: boolean;
    delayWhenEmpty: DelayStrategy;
    maxDelayWhenEmpty: number; // milliseconds

    constructor(init?: Partial<EvDbContinuousFetchOptions>) {
        this.completeWhenEmpty = init?.completeWhenEmpty ?? false;
        this.delayWhenEmpty = init?.delayWhenEmpty ?? new DelayStrategy();
        this.maxDelayWhenEmpty = init?.maxDelayWhenEmpty
            ?? EvDbContinuousFetchOptions.MAX_DELAY_SEC * 1000;
    }
}
