import "./otel.js";

import express from "express";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { createServer } from "node:http";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import EvDbPrismaStorageAdapter from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";

import { createDepositHttpHandler } from "#BusinessCapabilities/Funds/slices/DepositFunds/http/index.js";
import { createWithdrawHttpHandler } from "#BusinessCapabilities/Funds/slices/WithdrawFunds/http/index.js";
import { createLeaderboardAdapter } from "#BusinessCapabilities/Funds/slices/AccountLeaderboard/adapter.js";
import { registerLeaderboardWorker, LEADERBOARD_QUEUE } from "#BusinessCapabilities/Funds/slices/AccountLeaderboard/pgboss/index.js";
import { createLeaderboardHttpHandler } from "#BusinessCapabilities/Funds/slices/AccountLeaderboard/http/index.js";
import { composeOpenApi, composeAsyncApi } from "#abstractions/catalog/composeSpecs.js";
import { depositFundsOpenApi } from "#BusinessCapabilities/Funds/slices/DepositFunds/openapi.js";
import { withdrawFundsOpenApi } from "#BusinessCapabilities/Funds/slices/WithdrawFunds/openapi.js";
import { accountLeaderboardOpenApi } from "#BusinessCapabilities/Funds/slices/AccountLeaderboard/openapi.js";
import { fundsOutboxAsyncApi } from "#BusinessCapabilities/Funds/swimlanes/Funds/asyncapi.js";
import { leaderboardAsyncApi } from "#BusinessCapabilities/Funds/slices/AccountLeaderboard/asyncapi.js";

const config = {
  postgresConnection: process.env.POSTGRES_CONNECTION ?? "postgres://funds:funds123@localhost:5434/funds",
  port: Number(process.env.PORT ?? 3014),
};

// Installs the outbox → pg-boss trigger. Must be called AFTER boss.start()
// so the pgboss schema exists.
async function installOutboxTrigger(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION insert_leaderboard_pgboss_job()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.message_type = 'FundsChanged' THEN
          INSERT INTO pgboss.job (name, data, priority)
          VALUES (
            '${LEADERBOARD_QUEUE}',
            jsonb_build_object(
              'metadata', jsonb_build_object('outboxId', NEW.id::text),
              'payload',  NEW.payload::jsonb
            ),
            0
          );
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(`DROP TRIGGER IF EXISTS leaderboard_pgboss_trigger ON outbox`);
    await client.query(`
      CREATE TRIGGER leaderboard_pgboss_trigger
        AFTER INSERT ON outbox
        FOR EACH ROW
        EXECUTE FUNCTION insert_leaderboard_pgboss_job()
    `);
    console.log("[Startup] outbox → pg-boss trigger installed");
  } finally {
    client.release();
  }
}

async function main() {
  const storeClient = EvDbPostgresPrismaClientFactory.create(config.postgresConnection);
  const storageAdapter = new EvDbPrismaStorageAdapter(storeClient);
  const pool = new pg.Pool({ connectionString: config.postgresConnection });

  const boss = new PgBoss(config.postgresConnection);
  await boss.start();
  console.log("[Startup] pg-boss started");

  await installOutboxTrigger(pool);

  const leaderboardAdapter = createLeaderboardAdapter(pool);
  await registerLeaderboardWorker(boss, leaderboardAdapter);

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "funds-main" }));

  app.get("/openapi.json", (_req, res) => {
    res.json(composeOpenApi({
      title: "funds-main",
      version: "1.0.0",
      description: "REST endpoints for the funds main server (deposits, withdrawals, leaderboard view).",
      paths: [depositFundsOpenApi, withdrawFundsOpenApi, accountLeaderboardOpenApi],
    }));
  });

  app.get("/asyncapi.json", (_req, res) => {
    res.json(composeAsyncApi({
      title: "funds-main async",
      version: "1.0.0",
      description: "Async channels owned by funds-main: outbox 'send' (broadcast) + pg-boss 'receive' (P2P consumer).",
      fragments: [fundsOutboxAsyncApi, leaderboardAsyncApi],
    }));
  });

  app.post("/api/funds/deposit", createDepositHttpHandler(storageAdapter));
  app.post("/api/funds/withdraw", createWithdrawHttpHandler(storageAdapter));
  app.post("/api/funds/leaderboard/update", createLeaderboardHttpHandler(leaderboardAdapter));

  app.get("/api/funds/leaderboard", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT account_id, currency, total_deposited, total_withdrawn, last_balance,
                deposit_count, withdrawal_count, last_activity
         FROM account_leaderboard
         ORDER BY last_balance DESC
         LIMIT 50`,
      );
      res.json({ leaderboard: rows });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(config.port, resolve); });
  console.log(`[Startup] funds server running at http://localhost:${config.port}`);
  console.log(`[Startup] POST /api/funds/deposit | POST /api/funds/withdraw`);
  console.log(`[Startup] GET  /api/funds/leaderboard`);

  const shutdown = async (signal: string) => {
    console.log(`[Shutdown] ${signal} received`);
    await Promise.allSettled([
      boss.stop(),
      new Promise<void>((resolve, reject) => { server.close((err) => err ? reject(err) : resolve()); }),
      pool.end(),
    ]);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => { console.error("[Startup] failed:", err); process.exit(1); });
