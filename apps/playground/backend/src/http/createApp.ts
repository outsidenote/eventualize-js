import express from "express";
import type { Express, Request, RequestHandler, Response } from "express";
import { getHead } from "../accounts/getHead.js";
import { listAccountSummaries } from "../accounts/summaries.js";
import { getTimeline } from "../accounts/timeline.js";
import { deposit, withdraw } from "../commands/commands.js";
import { runDetection } from "../detection/runDetection.js";
import { generate } from "../generator/generate.js";
import { replayBatch } from "../replay/replayBatch.js";
import type { PlaygroundStorage } from "../storage.js";
import { errorHandler } from "./errorHandler.js";
import {
  parseAccountId,
  parseCommandBody,
  parseDetectBody,
  parseGenerateBody,
  parseReplayQuery,
} from "./validation.js";

export type AppDeps = {
  readonly storage: PlaygroundStorage;
  readonly listAccounts: () => Promise<string[]>;
};

type AccountParams = { id: string };

/** Express 4 does not forward rejected promises; route them to the error handler. */
const handle =
  <P = Record<string, never>>(
    fn: (req: Request<P>, res: Response) => Promise<void>,
  ): RequestHandler<P> =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export function createApp({ storage, listAccounts }: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get(
    "/api/accounts",
    handle(async (_req, res) => {
      res.json({ accounts: await listAccountSummaries(storage, listAccounts) });
    }),
  );

  app.get(
    "/api/accounts/:id",
    handle<AccountParams>(async (req, res) => {
      res.json(await getHead(storage, parseAccountId(req.params.id)));
    }),
  );

  app.post(
    "/api/accounts/:id/deposit",
    handle<AccountParams>(async (req, res) => {
      const id = parseAccountId(req.params.id);
      res.json(await deposit(storage, id, parseCommandBody(req.body)));
    }),
  );

  app.post(
    "/api/accounts/:id/withdraw",
    handle<AccountParams>(async (req, res) => {
      const id = parseAccountId(req.params.id);
      res.json(await withdraw(storage, id, parseCommandBody(req.body)));
    }),
  );

  app.get(
    "/api/accounts/:id/replay",
    handle<AccountParams>(async (req, res) => {
      const id = parseAccountId(req.params.id);
      res.json(await replayBatch(storage, id, parseReplayQuery(req.query)));
    }),
  );

  app.post(
    "/api/accounts/:id/generate",
    handle<AccountParams>(async (req, res) => {
      const id = parseAccountId(req.params.id);
      res.json(await generate(storage, id, parseGenerateBody(req.body)));
    }),
  );

  app.get(
    "/api/accounts/:id/timeline",
    handle<AccountParams>(async (req, res) => {
      res.json(await getTimeline(storage, parseAccountId(req.params.id)));
    }),
  );

  app.post(
    "/api/accounts/:id/detect",
    handle<AccountParams>(async (req, res) => {
      const id = parseAccountId(req.params.id);
      res.json(await runDetection(storage, id, parseDetectBody(req.body)));
    }),
  );

  app.use(errorHandler);
  return app;
}
