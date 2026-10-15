import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { BalanceState } from "./views.js";
import { LARGE_TRANSACTION } from "./views.js";

export const LARGE_TRANSACTION_ALERT = "LargeTransactionAlert";

/** Outbox producer shared by all playground events. Fires for large transactions only. */
export function largeTransactionAlert(
  payload: { readonly value: number; readonly currency: string },
  views: { readonly balance: BalanceState },
  metadata: IEvDbEventMetadata,
): EvDbMessage[] {
  if (payload.value < LARGE_TRANSACTION) return [];
  return [
    EvDbMessage.createFromMetadata(metadata, LARGE_TRANSACTION_ALERT, {
      eventType: metadata.eventType,
      value: payload.value,
      currency: payload.currency,
      balanceAfter: views.balance.amount,
    }),
  ];
}
