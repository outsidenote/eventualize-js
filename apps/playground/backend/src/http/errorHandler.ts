import type { NextFunction, Request, Response } from "express";
import { ConflictError, isOccConflict, NotFoundError, ValidationError } from "../errors.js";

/** Express and body-parser attach a 4xx `status` to client errors (bad JSON, too large, bad URI, ...). */
function clientStatusOf(err: Error): number | undefined {
  if ("status" in err && typeof err.status === "number" && err.status >= 400 && err.status < 500) {
    return err.status;
  }
  return undefined;
}

export function statusFor(err: Error): number {
  if (err instanceof ValidationError) return 400;
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ConflictError) return 409;
  if (isOccConflict(err)) return 409;
  return clientStatusOf(err) ?? 500;
}

export function errorHandler(err: Error, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  const status = statusFor(err);
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? "internal error" : err.message });
}
