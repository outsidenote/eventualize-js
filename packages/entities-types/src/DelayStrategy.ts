export default class DelayStrategy {
    startDuration: number; // milliseconds
    incrementalLogic: (lastDelay: number, attempt: number) => number;

    constructor(init?: Partial<DelayStrategy>) {
        this.startDuration = init?.startDuration ?? 200; // 200 ms default
        this.incrementalLogic = init?.incrementalLogic ?? this.defaultNextDelay.bind(this);
    }

    private defaultNextDelay(lastDelay: number, attempt: number): number {
        if (attempt <= 5) {
            return this.startDuration;
        }

        // When lastDelay == 0 → return 50ms
        if (lastDelay === 0) {
            return 50;
        }

        // Exponential growth: double the last delay
        return lastDelay * 2;
    }
}
