import type { IReplayEngine, ReplayTarget, StateDiff, DiffOptions, StepResult } from '../types.js';

export class DiffCalculator<TState> {
  constructor(
    private readonly replayEngine: IReplayEngine<TState>
  ) {}

  async diff(from: ReplayTarget, to: ReplayTarget, options?: DiffOptions): Promise<StateDiff<TState>> {
    const [fromResult, toResult] = await Promise.all([
      this.replayToWithOffset(from),
      this.replayToWithOffset(to)
    ]);

    const changedKeys = this.findChangedKeys(fromResult.state, toResult.state, options);

    return {
      from: { offset: fromResult.offset, state: fromResult.state },
      to: { offset: toResult.offset, state: toResult.state },
      changedKeys
    };
  }

  private async replayToWithOffset(target: ReplayTarget): Promise<{ state: TState; offset: number }> {
    let lastResult: StepResult<TState> | null = null;

    for await (const result of this.replayEngine.replay(target)) {
      lastResult = result;
    }

    if (lastResult) {
      return { state: lastResult.state, offset: lastResult.offset };
    }

    // No events reached the target (empty stream or target before first event).
    // replayTo handles snapshot edge cases and returns the correct initial state.
    const state = await this.replayEngine.replayTo(target);
    return { state, offset: -1 };
  }

  private findChangedKeys(from: TState, to: TState, options?: DiffOptions): string[] {
    const changedKeys: string[] = [];

    if (typeof from !== 'object' || typeof to !== 'object' || from === null || to === null) {
      if (from !== to) {
        return ['value'];
      }
      return [];
    }

    const allKeys = new Set([
      ...Object.keys(from as object),
      ...Object.keys(to as object)
    ]);

    for (const key of allKeys) {
      const fromVal = (from as Record<string, unknown>)[key];
      const toVal = (to as Record<string, unknown>)[key];

      const isDifferent = options?.equals
        ? !options.equals(fromVal, toVal)
        : this.valuesAreDifferent(fromVal, toVal, options?.deepCompare);

      if (isDifferent) {
        changedKeys.push(key);
      }
    }

    return changedKeys;
  }

  private valuesAreDifferent(fromVal: unknown, toVal: unknown, deepCompare?: boolean): boolean {
    if (fromVal === toVal) {
      return false;
    }

    if (fromVal === null || toVal === null || typeof fromVal !== typeof toVal) {
      return true;
    }

    if (typeof fromVal !== 'object') {
      return true;
    }

    if (!deepCompare) {
      return true;
    }

    return JSON.stringify(fromVal) !== JSON.stringify(toVal);
  }
}
