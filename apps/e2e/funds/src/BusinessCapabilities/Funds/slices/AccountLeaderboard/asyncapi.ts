import type { AsyncApiFragment } from "../../swimlanes/Funds/asyncapi.js";
import { LEADERBOARD_QUEUE } from "./pgboss/index.js";

export const leaderboardAsyncApi: AsyncApiFragment = {
  channels: {
    [`pgboss/${LEADERBOARD_QUEUE}`]: {
      address: LEADERBOARD_QUEUE,
      title: "Leaderboard update queue (pg-boss)",
      description: "Each row in funds_outbox of message_type=FundsChanged triggers a pg-boss job on this queue. The leaderboard worker consumes and upserts the account_leaderboard row.",
      messages: { LeaderboardUpdateJob: { $ref: "#/components/messages/LeaderboardUpdateJob" } },
      bindings: {
        "x-pgboss": { queue: LEADERBOARD_QUEUE },
      },
    },
  },
  operations: {
    receiveLeaderboardUpdate: {
      action: "receive",
      channel: { $ref: `#/channels/pgboss~1${LEADERBOARD_QUEUE}` },
      summary: "Consume a leaderboard update job",
      messages: [{ $ref: `#/channels/pgboss~1${LEADERBOARD_QUEUE}/messages/LeaderboardUpdateJob` }],
    },
  },
  components: {
    messages: {
      LeaderboardUpdateJob: {
        name: "LeaderboardUpdateJob",
        title: "Leaderboard upsert job",
        contentType: "application/json",
        payload: {
          type: "object",
          required: ["metadata", "payload"],
          properties: {
            metadata: {
              type: "object",
              properties: { outboxId: { type: "string" } },
            },
            payload: {
              type: "object",
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
    },
  },
};
