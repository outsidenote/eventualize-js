import type { AsyncApiFragment } from "../../swimlanes/Funds/asyncapi.js";

export const riskAssessmentAsyncApi: AsyncApiFragment = {
  channels: {
    "funds.outbox": {
      address: "funds.outbox",
      title: "Funds outbox (subscribed by risk service)",
      description: "Risk service consumes FundsChanged messages from this Kafka topic and updates the per-account risk document in MongoDB.",
      messages: { FundsChanged: { $ref: "#/components/messages/FundsChanged" } },
      bindings: { kafka: { topic: "funds.outbox", groupId: "e2e-funds-risk" } },
    },
  },
  operations: {
    receiveFundsChangedForRisk: {
      action: "receive",
      channel: { $ref: "#/channels/funds.outbox" },
      summary: "Process a FundsChanged event for risk re-assessment",
      messages: [{ $ref: "#/channels/funds.outbox/messages/FundsChanged" }],
    },
  },
  components: {
    messages: {
      FundsChanged: {
        name: "FundsChanged",
        title: "Funds balance changed (consumed by risk)",
        contentType: "application/json",
        payload: {
          type: "object",
          required: ["accountId", "currentBalance", "delta", "currency", "transactionId"],
          properties: {
            accountId: { type: "string" },
            currentBalance: { type: "number" },
            delta: { type: "number" },
            currency: { type: "string" },
            transactionId: { type: "string" },
          },
        },
      },
    },
  },
};
