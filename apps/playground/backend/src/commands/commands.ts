import { cents } from "../domain/money.js";
import PlaygroundFundsStreamFactory from "../domain/PlaygroundFundsStreamFactory.js";
import type { PlaygroundFundsStream } from "../domain/PlaygroundFundsStreamFactory.js";
import type { PlaygroundViews } from "../domain/views.js";
import { copyViews } from "../domain/views.js";
import { ValidationError } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";

export const INSUFFICIENT_FUNDS = "insufficient funds";

export type CommandInput = {
  readonly value: number;
  readonly currency: string;
  readonly description?: string;
};

export type PlaygroundEventType = "FundsDeposited" | "FundsWithdrawn" | "WithdrawalDenied";

export type CommandResult = {
  readonly offset: number;
  readonly eventType: PlaygroundEventType;
  readonly views: PlaygroundViews;
};

export type CommandIntent = {
  readonly kind: "deposit" | "withdraw";
  readonly value: number;
  readonly description: string;
};

export async function load(
  storage: PlaygroundStorage,
  streamId: string,
): Promise<PlaygroundFundsStream> {
  return PlaygroundFundsStreamFactory.get(streamId, storage, storage);
}

/** The account currency is fixed by the first deposit. */
export function assertCurrency(stream: PlaygroundFundsStream, currency: string): void {
  const accountCurrency = stream.views.balance.currency;
  if (accountCurrency !== "" && accountCurrency !== currency) {
    throw new ValidationError(`account currency is ${accountCurrency}, got ${currency}`);
  }
}

/**
 * Appends the event the intent decides: a deposit always succeeds; a withdraw becomes
 * FundsWithdrawn when the balance (in cents) covers it, otherwise WithdrawalDenied.
 */
export async function appendIntent(
  stream: PlaygroundFundsStream,
  intent: CommandIntent,
  currency: string,
): Promise<PlaygroundEventType> {
  const value = cents(intent.value);
  const payload = { description: intent.description, value, currency };
  if (intent.kind === "deposit") {
    await stream.appendEventFundsDeposited(payload);
    return "FundsDeposited";
  }
  if (cents(stream.views.balance.amount) >= value) {
    await stream.appendEventFundsWithdrawn(payload);
    return "FundsWithdrawn";
  }
  await stream.appendEventWithdrawalDenied({ ...payload, reason: INSUFFICIENT_FUNDS });
  return "WithdrawalDenied";
}

function toResult(stream: PlaygroundFundsStream, eventType: PlaygroundEventType): CommandResult {
  return { offset: stream.storedOffset, eventType, views: copyViews(stream.views) };
}

async function runCommand(
  storage: PlaygroundStorage,
  streamId: string,
  input: CommandInput,
  kind: CommandIntent["kind"],
): Promise<CommandResult> {
  const stream = await load(storage, streamId);
  assertCurrency(stream, input.currency);
  const description = input.description ?? (kind === "deposit" ? "deposit" : "withdrawal");
  const eventType = await appendIntent(
    stream,
    { kind, value: input.value, description },
    input.currency,
  );
  await stream.store();
  return toResult(stream, eventType);
}

export const deposit = (
  storage: PlaygroundStorage,
  streamId: string,
  input: CommandInput,
): Promise<CommandResult> => runCommand(storage, streamId, input, "deposit");

/** Appends FundsWithdrawn when the balance covers `value`, otherwise WithdrawalDenied. */
export const withdraw = (
  storage: PlaygroundStorage,
  streamId: string,
  input: CommandInput,
): Promise<CommandResult> => runCommand(storage, streamId, input, "withdraw");
