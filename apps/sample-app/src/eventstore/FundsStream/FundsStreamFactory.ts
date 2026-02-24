import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { FundsDeposited } from "./FundsEvents/FundsDeposited.js";
import type { FundsWithdrawal } from "./FundsEvents/FundsWithdrawal.js";
import type { FundsCaptured } from "./FundsEvents/FundsCaptured.js";
import type { FundsDenied } from "./FundsEvents/FundsDenied.js";
import type { FundsRefunded } from "./FundsEvents/FundsRefunded.js";

const FundsStreamFactory = new StreamFactoryBuilder("funds-stream")
  .withEvent<FundsDeposited>()
  .withEvent<FundsWithdrawal>()
  .withEvent<FundsCaptured>()
  .withEvent<FundsDenied>()
  .withEvent<FundsRefunded>()
  .build();

export default FundsStreamFactory;

export type PointsStreamType = typeof FundsStreamFactory.StreamType;
