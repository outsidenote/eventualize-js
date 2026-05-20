import type { OpenAPIV3_1 } from "openapi-types";

export const accountLeaderboardOpenApi: OpenAPIV3_1.PathsObject = {
  "/api/funds/leaderboard": {
    get: {
      summary: "List top accounts by balance",
      description: "Returns the leaderboard view (top 50 accounts by last_balance).",
      tags: ["Leaderboard"],
      operationId: "getLeaderboard",
      responses: {
        "200": {
          description: "Leaderboard rows",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  leaderboard: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        account_id: { type: "string" },
                        currency: { type: "string" },
                        total_deposited: { type: "number" },
                        total_withdrawn: { type: "number" },
                        last_balance: { type: "number" },
                        deposit_count: { type: "integer" },
                        withdrawal_count: { type: "integer" },
                        last_activity: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "/api/funds/leaderboard/update": {
    post: {
      summary: "Manually upsert a leaderboard row",
      description: "Bypasses the pg-boss queue. Used for testing the command handler directly.",
      tags: ["Leaderboard"],
      operationId: "updateLeaderboard",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["accountId", "delta", "currentBalance"],
              properties: {
                accountId: { type: "string", example: "acc-123" },
                delta: { type: "number", example: 100 },
                currentBalance: { type: "number", example: 500 },
                currency: { type: "string", example: "USD" },
                transactionId: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Row upserted" },
        "400": { description: "Validation error" },
        "500": { description: "Internal error" },
      },
    },
  },
};
