import "./otel.js";

import express from "express";
import { Kafka } from "kafkajs";
import { MongoClient } from "mongodb";
import { createServer } from "node:http";

import { createRiskAdapter } from "#BusinessCapabilities/Funds/slices/RiskAssessment/adapter.js";
import { startRiskKafkaConsumer } from "#BusinessCapabilities/Funds/slices/RiskAssessment/kafka/index.js";
import { createRiskHttpHandler } from "#BusinessCapabilities/Funds/slices/RiskAssessment/http/index.js";
import type { AccountRiskDoc } from "#BusinessCapabilities/Funds/slices/RiskAssessment/commandHandler.js";

const config = {
  mongoUri: process.env.MONGO_URI ?? "mongodb://localhost:27017",
  mongoDb: process.env.MONGO_DB ?? "funds_risk",
  kafkaBootstrap: process.env.KAFKA_BOOTSTRAP ?? "localhost:9092",
  port: Number(process.env.PORT ?? 3011),
};

async function main() {
  const mongoClient = new MongoClient(config.mongoUri);
  await mongoClient.connect();
  const collection = mongoClient.db(config.mongoDb).collection<AccountRiskDoc>("account_risk");
  await collection.createIndex({ accountId: 1 }, { unique: true });

  const kafka = new Kafka({ clientId: "e2e-funds-risk", brokers: [config.kafkaBootstrap] });
  const riskAdapter = createRiskAdapter(collection);
  const riskConsumer = startRiskKafkaConsumer(kafka, riskAdapter);

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "funds-risk" }));

  app.post("/api/risk/update", createRiskHttpHandler(riskAdapter));

  app.get("/api/risk/:accountId", async (req, res) => {
    try {
      const doc = await collection.findOne({ accountId: req.params.accountId });
      if (!doc) { res.status(404).json({ error: "Account not found" }); return; }
      res.json({
        accountId: doc.accountId,
        riskLevel: doc.riskLevel,
        currentBalance: doc.currentBalance,
        transactionCount: doc.transactions.length,
        assessedAt: doc.assessedAt,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(config.port, resolve); });
  console.log(`[Startup] risk server running at http://localhost:${config.port}`);
  console.log(`[Startup] GET  /api/risk/:accountId`);

  const shutdown = async (signal: string) => {
    console.log(`[Shutdown] ${signal} received`);
    await riskConsumer.stop();
    await new Promise<void>((resolve, reject) => { server.close((err) => err ? reject(err) : resolve()); });
    await mongoClient.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => { console.error("[Startup] failed:", err); process.exit(1); });
