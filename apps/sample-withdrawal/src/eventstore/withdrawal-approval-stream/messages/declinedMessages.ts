import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type { FundsWithdrawalDeclined } from "../events/FundsWithdrawalDeclined.js";

export const withdrawalDeclinedMessages = (
  event: EvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => {
  const payload = event.payload as FundsWithdrawalDeclined;

  return [
    EvDbMessage.createFromEvent(event, {
      payloadType: "Withdrawal Declined Notification",
      account: payload.account,
      amount: payload.amount,
      reason: payload.reason,
      currency: payload.currency,
    }),
  ];
};
