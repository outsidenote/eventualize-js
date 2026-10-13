import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { FundsDeposited } from "../events/FundsDeposited.js";
import type { FundsWithdrawn } from "../events/FundsWithdrawn.js";

export const depositedMessages = (
  payload: Readonly<FundsDeposited>,
  views: Readonly<{ balance: number }>,
  metadata: IEvDbEventMetadata,
): EvDbMessage[] => [
  EvDbMessage.createFromMetadata(metadata, "FundsChanged", {
    accountId: payload.accountId,
    currentBalance: views.balance,
    delta: payload.amount,
    currency: payload.currency,
    transactionId: String(metadata.streamCursor.offset),
  }),
];

export const withdrawnMessages = (
  payload: Readonly<FundsWithdrawn>,
  views: Readonly<{ balance: number }>,
  metadata: IEvDbEventMetadata,
): EvDbMessage[] => [
  EvDbMessage.createFromMetadata(metadata, "FundsChanged", {
    accountId: payload.accountId,
    currentBalance: views.balance,
    delta: -payload.amount,
    currency: payload.currency,
    transactionId: String(metadata.streamCursor.offset),
  }),
];
