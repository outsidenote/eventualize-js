import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { FundsDeposited, FundsWithdrawn, WithdrawalDenied } from "./events.js";
import { STREAM_TYPE } from "./streamType.js";
import { largeTransactionAlert } from "./messages.js";
import {
  balanceDefault,
  balanceOnDeposited,
  balanceOnWithdrawn,
  riskDefault,
  riskOnDenied,
  riskOnDeposited,
  riskOnWithdrawn,
  statsDefault,
  statsOnDenied,
  statsOnDeposited,
  statsOnWithdrawn,
} from "./views.js";

const PlaygroundFundsStreamFactory = new StreamFactoryBuilder(STREAM_TYPE)
  .withEvent("FundsDeposited")
  .asType<FundsDeposited>()
  .withEvent("FundsWithdrawn")
  .asType<FundsWithdrawn>()
  .withEvent("WithdrawalDenied")
  .asType<WithdrawalDenied>()
  .withView("balance", balanceDefault, {
    FundsDeposited: balanceOnDeposited,
    FundsWithdrawn: balanceOnWithdrawn,
  })
  .withView("stats", statsDefault, {
    FundsDeposited: statsOnDeposited,
    FundsWithdrawn: statsOnWithdrawn,
    WithdrawalDenied: statsOnDenied,
  })
  .withView("risk", riskDefault, {
    FundsDeposited: riskOnDeposited,
    FundsWithdrawn: riskOnWithdrawn,
    WithdrawalDenied: riskOnDenied,
  })
  .withMessages("FundsDeposited", largeTransactionAlert)
  .withMessages("FundsWithdrawn", largeTransactionAlert)
  .withMessages("WithdrawalDenied", largeTransactionAlert)
  .build();

export default PlaygroundFundsStreamFactory;

export type PlaygroundFundsStream = typeof PlaygroundFundsStreamFactory.StreamType;
