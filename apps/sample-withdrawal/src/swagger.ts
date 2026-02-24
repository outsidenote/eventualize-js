export const swaggerDocument = {
  openapi: "3.0.3",
  info: {
    title: "Withdrawal Approval API",
    description: "Event-sourced withdrawal approval slice — powered by eventualize-js",
    version: "1.0.0",
  },
  paths: {
    "/api/withdrawals/approve": {
      post: {
        summary: "Approve a withdrawal",
        description:
          "Executes the ApproveWithdrawal command. Returns FundsWithdrawalApproved if balance is sufficient, or FundsWithdrawalDeclined if not.",
        tags: ["Withdrawals"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApproveWithdrawalRequest" },
              example: {
                account: "1234",
                amount: 20,
                currency: "USD",
                currentBalance: 200,
                session: "s1",
                source: "ATM",
                payer: "John Doe",
                transactionId: "tx-001",
                approvalDate: "2025-01-01T11:00:00Z",
                transactionTime: "2025-01-01T11:00:00Z",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Command executed and events stored",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApproveWithdrawalResponse" },
              },
            },
          },
          "400": {
            description: "Missing required fields",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "409": {
            description: "Optimistic concurrency violation",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/withdrawals/{streamId}": {
      get: {
        summary: "Get a withdrawal stream",
        description: "Fetches the stream from Postgres and returns the current view state.",
        tags: ["Withdrawals"],
        parameters: [
          {
            name: "streamId",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The account / stream ID",
            example: "1234",
          },
        ],
        responses: {
          "200": {
            description: "Stream state",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GetStreamResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ApproveWithdrawalRequest: {
        type: "object",
        required: ["account", "amount", "currentBalance"],
        properties: {
          account: { type: "string", description: "Account identifier" },
          amount: { type: "number", description: "Withdrawal amount" },
          currentBalance: { type: "number", description: "Current account balance" },
          currency: { type: "string", default: "USD" },
          session: { type: "string", default: "api" },
          source: { type: "string", default: "REST" },
          payer: { type: "string", default: "unknown" },
          transactionId: { type: "string", description: "Auto-generated UUID if omitted" },
          approvalDate: { type: "string", format: "date-time", description: "Defaults to now" },
          transactionTime: { type: "string", format: "date-time", description: "Defaults to now" },
        },
      },
      ApproveWithdrawalResponse: {
        type: "object",
        properties: {
          streamId: { type: "string" },
          event: {
            type: "object",
            description: "FundsWithdrawalApproved or FundsWithdrawalDeclined payload",
            properties: {
              payloadType: { type: "string", enum: ["FundsWithdrawalApproved", "FundsWithdrawalDeclined"] },
              account: { type: "string" },
              amount: { type: "number" },
              currency: { type: "string" },
              payer: { type: "string" },
              source: { type: "string" },
              transactionId: { type: "string" },
              reason: { type: "string", description: "Only present when declined" },
            },
          },
          view: {
            type: "object",
            properties: {
              balance: { type: "number" },
            },
          },
        },
      },
      GetStreamResponse: {
        type: "object",
        properties: {
          streamId: { type: "string" },
          storedOffset: { type: "number" },
          view: {
            type: "object",
            properties: {
              balance: { type: "number" },
            },
          },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
    },
  },
};
