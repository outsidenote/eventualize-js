import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { FundsDeposited } from "./events/FundsDeposited.js";
import type { FundsWithdrawn } from "./events/FundsWithdrawn.js";
import { viewName, defaultState, handlers } from "./views/Balance/index.js";
import { depositedMessages, withdrawnMessages } from "./messages/fundsChangedMessages.js";

const FundsStreamFactory = new StreamFactoryBuilder("funds-stream")
  .withEvent("FundsDeposited").asType<FundsDeposited>()
  .withEvent("FundsWithdrawn").asType<FundsWithdrawn>()
  .withView(viewName, defaultState, handlers)
  .withMessages("FundsDeposited", depositedMessages)
  .withMessages("FundsWithdrawn", withdrawnMessages)
  .build();

export default FundsStreamFactory;
export type FundsStreamType = typeof FundsStreamFactory.StreamType;
