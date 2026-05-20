import type { OpenAPIV3_1 } from "openapi-types";

export const riskAssessmentOpenApi: OpenAPIV3_1.PathsObject = {
  "/api/risk/{accountId}": {
    get: {
      summary: "Get current risk assessment for an account",
      tags: ["Risk"],
      operationId: "getRisk",
      parameters: [
        { name: "accountId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description: "Risk document",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  accountId: { type: "string" },
                  riskLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
                  currentBalance: { type: "number" },
                  transactionCount: { type: "integer" },
                  assessedAt: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        "404": { description: "Account not found" },
      },
    },
  },
  "/api/risk/update": {
    post: {
      summary: "Manually upsert a risk assessment",
      description: "Bypasses the Kafka consumer. Used for testing.",
      tags: ["Risk"],
      operationId: "updateRisk",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["accountId", "delta", "currentBalance"],
              properties: {
                accountId: { type: "string" },
                delta: { type: "number" },
                currentBalance: { type: "number" },
                currency: { type: "string" },
                transactionId: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Risk upserted" },
        "400": { description: "Validation error" },
        "500": { description: "Internal error" },
      },
    },
  },
};
