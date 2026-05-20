import type { Kafka } from "kafkajs";
import { launchKafkaConsumer } from "#abstractions/endpoints/kafkaConsumerUtils.js";
import type { RiskAssessmentAdapter } from "../adapter.js";

interface FundsChangedPayload {
  accountId: string;
  currentBalance: number;
  delta: number;
  currency: string;
  transactionId: string;
}

export function startRiskKafkaConsumer(
  kafka: Kafka,
  adapter: RiskAssessmentAdapter,
): { stop: () => Promise<void> } {
  return launchKafkaConsumer({
    kafka,
    groupId: "risk.FundsChanged",
    topics: ["events.FundsChanged"],
    onMessage: async (_topic, payload, _meta) => {
      const p = payload as unknown as FundsChangedPayload;
      await adapter({
        commandType: "UpdateAccountRisk",
        accountId: p.accountId,
        delta: p.delta,
        currentBalance: p.currentBalance,
        currency: p.currency,
        transactionId: p.transactionId,
      });
      console.log(`[Risk] updated account=${p.accountId} delta=${p.delta}`);
    },
  });
}
