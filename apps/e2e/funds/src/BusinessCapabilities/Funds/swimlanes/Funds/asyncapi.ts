// Minimal AsyncAPI 3.0 fragment shape. Full type lives in @asyncapi/parser
// but we only need a portable subset for slice-level composition.
export interface AsyncApiFragment {
  channels?: Record<string, unknown>;
  operations?: Record<string, unknown>;
  components?: { messages?: Record<string, unknown>; schemas?: Record<string, unknown> };
}

export const fundsOutboxAsyncApi: AsyncApiFragment = {
  channels: {
    "funds.outbox": {
      address: "funds.outbox",
      title: "Funds outbox (Kafka via Debezium CDC)",
      description: "Every FundsDeposited / FundsWithdrawn event in the funds stream produces a FundsChanged outbox row, which Debezium publishes to this Kafka topic.",
      messages: { FundsChanged: { $ref: "#/components/messages/FundsChanged" } },
      bindings: { kafka: { topic: "funds.outbox" } },
    },
  },
  operations: {
    sendFundsChanged: {
      action: "send",
      channel: { $ref: "#/channels/funds.outbox" },
      summary: "Broadcast a FundsChanged event",
      messages: [{ $ref: "#/channels/funds.outbox/messages/FundsChanged" }],
    },
  },
  components: {
    messages: {
      FundsChanged: {
        name: "FundsChanged",
        title: "Funds balance changed",
        contentType: "application/json",
        payload: {
          type: "object",
          required: ["accountId", "currentBalance", "delta", "currency", "transactionId"],
          properties: {
            accountId: { type: "string" },
            currentBalance: { type: "number" },
            delta: { type: "number", description: "Positive for deposits, negative for withdrawals" },
            currency: { type: "string" },
            transactionId: { type: "string" },
          },
        },
      },
    },
  },
};
