import type { Collection } from "mongodb";
import type { UpdateAccountRisk } from "./command.js";
import type { AccountRiskDoc } from "./commandHandler.js";
import { handleUpdateRisk } from "./commandHandler.js";

export type RiskAssessmentAdapter = (cmd: UpdateAccountRisk) => Promise<void>;

export function createRiskAdapter(collection: Collection<AccountRiskDoc>): RiskAssessmentAdapter {
  return (cmd) => handleUpdateRisk(cmd, collection);
}
