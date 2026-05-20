import type { OpenAPIV3_1 } from "openapi-types";

export const depositFundsOpenApi: OpenAPIV3_1.PathsObject = {
  "/api/funds/deposit": {
    post: {
      summary: "Deposit funds into an account",
      description: "Appends a FundsDeposited event to the account stream and produces a FundsChanged outbox message.",
      tags: ["Funds"],
      operationId: "depositFunds",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["accountId", "amount", "currency"],
              properties: {
                accountId: { type: "string", example: "acc-123" },
                amount: { type: "number", minimum: 0, example: 100 },
                currency: { type: "string", example: "USD" },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Deposit recorded",
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
        "500": { description: "Internal error" },
      },
    },
  },
};
