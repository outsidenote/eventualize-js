import { appendIntent, assertCurrency, load } from "../commands/commands.js";
import type { PlaygroundViews } from "../domain/views.js";
import { copyViews } from "../domain/views.js";
import { ConflictError, isOccConflict } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";
import { assertReachable, planStep, resolveGoal } from "./planEvents.js";
import type { Pattern, Rng, Target } from "./planEvents.js";

const DEFAULT_CURRENCY = "USD";

export type GenerateInput = {
  readonly count: number;
  readonly pattern: Pattern;
  readonly currency?: string;
  readonly target?: Target;
  readonly storeEvery: number;
};

export type GenerateResult = {
  readonly fromOffset: number;
  readonly toOffset: number;
  readonly count: number;
  readonly denied: number;
  readonly views: PlaygroundViews;
};

/**
 * Appends `count` planned events to one stream, calling store() after every `storeEvery`
 * events and at the end. Each store() writes one snapshot per view.
 */
export async function generate(
  storage: PlaygroundStorage,
  streamId: string,
  input: GenerateInput,
  rng: Rng = Math.random,
): Promise<GenerateResult> {
  const stream = await load(storage, streamId);
  const currency = input.currency ?? (stream.views.balance.currency || DEFAULT_CURRENCY);
  assertCurrency(stream, currency);

  let goal: number | undefined;
  if (input.pattern === "targetBalance" && input.target !== undefined) {
    goal = resolveGoal(stream.views.balance.amount, input.target);
    assertReachable(stream.views.balance.amount, goal, input.count);
  }

  let denied = 0;
  let stored = 0;
  let pending = 0;
  try {
    for (let i = 0; i < input.count; i++) {
      const intent = planStep({
        pattern: input.pattern,
        balance: stream.views.balance.amount,
        rng,
        remainingSteps: input.count - i,
        goal,
      });
      if ((await appendIntent(stream, intent, currency)) === "WithdrawalDenied") denied++;
      pending++;
      if (pending === input.storeEvery || i === input.count - 1) {
        await stream.store();
        stored += pending;
        pending = 0;
      }
    }
  } catch (err) {
    if (isOccConflict(err)) {
      throw new ConflictError(
        `concurrent write: stored ${stored} of ${input.count} generated events`,
      );
    }
    throw err;
  }

  const toOffset = stream.storedOffset;
  return {
    fromOffset: toOffset - input.count + 1,
    toOffset,
    count: input.count,
    denied,
    views: copyViews(stream.views),
  };
}
