import type { OpenAPIV3_1 } from "openapi-types";

export const withdrawFundsOpenApi: OpenAPIV3_1.PathsObject = {
  "/api/funds/withdraw": {
    post: {
      summary: "Withdraw funds from an account",
      description: "Appends a FundsWithdrawn event to the account stream and produces a FundsChanged outbox message.",
      tags: ["Funds"],
      operationId: "withdrawFunds",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["accountId", "amount", "currency"],
              properties: {
                accountId: { type: "string", example: "acc-123" },
                amount: { type: "number", minimum: 0, example: 50 },
                currency: { type: "string", example: "USD" },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Withdrawal recorded",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  streamId: { type: "string" },
                  emittedEventTypes: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        "400": { description: "Validation error (accountId or amount missing)" },
        "409": { description: "Concurrent modification — retry the operation" },
        "422": { description: "Insufficient funds" },
        "500": { description: "Internal error" },
      },
    },
  },
};
