import type { FundsDeposited } from "../../events/FundsDeposited.js";
import type { FundsWithdrawn } from "../../events/FundsWithdrawn.js";
import type { BalanceViewState } from "./state.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";

export const handlers = {
  FundsDeposited: (state: BalanceViewState, event: FundsDeposited, _meta: IEvDbEventMetadata): BalanceViewState =>
    state + event.amount,

  FundsWithdrawn: (state: BalanceViewState, event: FundsWithdrawn, _meta: IEvDbEventMetadata): BalanceViewState =>
    state - event.amount,
};
