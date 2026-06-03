import type { FundsCaptured } from "./FundsEvents/FundsCaptured.js";
import type { FundsDenied } from "./FundsEvents/FundsDenied.js";
import type { FundsDeposited } from "./FundsEvents/FundsDeposited.js";
import type { FundsRefunded } from "./FundsEvents/FundsRefunded.js";
import type { FundsWithdrawal } from "./FundsEvents/FundsWithdrawal.js";
declare const FundsEventsAndViewsStreamFactory: import("@eventualize/core/factories/EvDbStreamFactory").EvDbStreamFactory<Record<"FundsCaptured", FundsCaptured> & Record<"FundsDenied", FundsDenied> & Record<"FundsDeposited", FundsDeposited> & Record<"FundsRefunded", FundsRefunded> & Record<"FundsWithdrawal", FundsWithdrawal>, "funds-stream", Record<"balance", number> & Record<"count", Map<string, number>>> & {
    StreamType: import("@eventualize/core/factories/EvDbStreamFactory").StreamWithEventMethods<Record<"FundsCaptured", FundsCaptured> & Record<"FundsDenied", FundsDenied> & Record<"FundsDeposited", FundsDeposited> & Record<"FundsRefunded", FundsRefunded> & Record<"FundsWithdrawal", FundsWithdrawal>, Record<"balance", number> & Record<"count", Map<string, number>>>;
};
export default FundsEventsAndViewsStreamFactory;
export type FundsEventsAndViewsStreamType = typeof FundsEventsAndViewsStreamFactory.StreamType;
