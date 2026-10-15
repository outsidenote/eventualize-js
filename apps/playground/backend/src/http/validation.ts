import type { CommandInput } from "../commands/commands.js";
import { isDetectorKind } from "../detection/detect.js";
import type { Detector } from "../detection/detect.js";
import { cents } from "../domain/money.js";
import { ValidationError } from "../errors.js";
import type { GenerateInput } from "../generator/generate.js";
import { isPattern } from "../generator/planEvents.js";
import type { Target } from "../generator/planEvents.js";
import type { ReplayOptions } from "../replay/replayBatch.js";

export const DEFAULT_BATCH_SIZE = 20;
export const MAX_BATCH_SIZE = 200;
export const MAX_AMOUNT = 1_000_000_000_000;
const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const INTEGER = /^\d+$/;

export function parseAccountId(raw: string): string {
  if (!ACCOUNT_ID.test(raw)) {
    throw new ValidationError("account id must be 1-64 chars: letters, digits, '-' or '_'");
  }
  return raw;
}

export function parseCommandBody(body: unknown): CommandInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("body must be a JSON object");
  }
  const value = "value" in body ? body.value : undefined;
  const currency = "currency" in body ? body.currency : undefined;
  const description = "description" in body ? body.description : undefined;

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    cents(value) <= 0 ||
    value > MAX_AMOUNT
  ) {
    throw new ValidationError(`value must be a number from 0.01 to ${MAX_AMOUNT}`);
  }
  if (typeof currency !== "string" || !CURRENCY.test(currency)) {
    throw new ValidationError("currency must be a 3-letter upper-case code");
  }
  if (description !== undefined && typeof description !== "string") {
    throw new ValidationError("description must be a string");
  }
  const trimmed = description?.trim();
  return trimmed ? { value, currency, description: trimmed } : { value, currency };
}

function parseInteger(raw: unknown, name: string, min: number, max: number): number {
  if (typeof raw !== "string" || !INTEGER.test(raw)) {
    throw new ValidationError(`${name} must be an integer`);
  }
  const n = Number(raw);
  if (n < min || n > max) throw new ValidationError(`${name} must be between ${min} and ${max}`);
  return n;
}

export function parseReplayQuery(query: { readonly [key: string]: unknown }): ReplayOptions {
  const offset = parseInteger(query.offset, "offset", 0, Number.MAX_SAFE_INTEGER);
  const batchSize =
    query.batchSize === undefined
      ? DEFAULT_BATCH_SIZE
      : parseInteger(query.batchSize, "batchSize", 1, MAX_BATCH_SIZE);
  const rawSnapshots = query.snapshots;
  if (rawSnapshots !== undefined && rawSnapshots !== "true" && rawSnapshots !== "false") {
    throw new ValidationError("snapshots must be true or false");
  }
  return { offset, batchSize, snapshots: rawSnapshots !== "false" };
}

export const MAX_GENERATE_COUNT = 500;

function parseIntField(raw: unknown, name: string, min: number, max: number): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return raw;
}

function parseTarget(raw: unknown): Target {
  if (typeof raw !== "object" || raw === null) {
    throw new ValidationError("target must be { mode, value }");
  }
  const mode = "mode" in raw ? raw.mode : undefined;
  const value = "value" in raw ? raw.value : undefined;
  if (mode !== "absolute" && mode !== "percent") {
    throw new ValidationError("target.mode must be absolute or percent");
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError("target.value must be a number");
  }
  if (mode === "absolute" && value > MAX_AMOUNT) {
    throw new ValidationError(`target.value must be at most ${MAX_AMOUNT}`);
  }
  if (mode === "percent" && (value < -100 || value > 1000)) {
    throw new ValidationError("target.value must be between -100 and 1000 for percent");
  }
  return { mode, value };
}

export function parseGenerateBody(body: unknown): GenerateInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("body must be a JSON object");
  }
  const count = parseIntField(
    "count" in body ? body.count : undefined,
    "count",
    1,
    MAX_GENERATE_COUNT,
  );
  const pattern = "pattern" in body ? body.pattern : undefined;
  if (typeof pattern !== "string" || !isPattern(pattern)) {
    throw new ValidationError("pattern must be random, riskSpike, riskCoolDown or targetBalance");
  }
  const rawStoreEvery = "storeEvery" in body ? body.storeEvery : undefined;
  const storeEvery =
    rawStoreEvery === undefined ? 1 : parseIntField(rawStoreEvery, "storeEvery", 1, count);
  const currency = "currency" in body ? body.currency : undefined;
  if (currency !== undefined && (typeof currency !== "string" || !CURRENCY.test(currency))) {
    throw new ValidationError("currency must be a 3-letter upper-case code");
  }
  const rawTarget = "target" in body ? body.target : undefined;
  if (pattern === "targetBalance") {
    if (rawTarget === undefined) throw new ValidationError("target is required for targetBalance");
    return {
      count,
      pattern,
      storeEvery,
      target: parseTarget(rawTarget),
      ...(currency ? { currency } : {}),
    };
  }
  if (rawTarget !== undefined) {
    throw new ValidationError("target is only allowed for targetBalance");
  }
  return { count, pattern, storeEvery, ...(currency ? { currency } : {}) };
}

const DETECTOR_PARAMS: Readonly<Record<string, readonly string[]>> = {
  riskJump: ["jump"],
  riskRise: ["percent", "window"],
  riskDecline: ["percent", "window"],
  balanceCrossUp: ["threshold"],
  balanceCrossDown: ["threshold"],
};

function numberIn(
  raw: unknown,
  name: string,
  min: number,
  max: number,
  minExclusive: boolean,
): number {
  if (
    typeof raw !== "number" ||
    !Number.isFinite(raw) ||
    raw > max ||
    (minExclusive ? raw <= min : raw < min)
  ) {
    throw new ValidationError(
      `${name} must be a number in ${minExclusive ? "(" : "["}${min}, ${max}]`,
    );
  }
  return raw;
}

export function parseDetectBody(body: unknown): Detector {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("body must be a JSON object");
  }
  const kind = "detector" in body ? body.detector : undefined;
  if (typeof kind !== "string" || !isDetectorKind(kind)) {
    throw new ValidationError(
      "detector must be riskJump, riskRise, riskDecline, balanceCrossUp or balanceCrossDown",
    );
  }
  const params = "params" in body ? body.params : undefined;
  if (typeof params !== "object" || params === null) {
    throw new ValidationError("params must be an object");
  }
  const allowed = DETECTOR_PARAMS[kind] ?? [];
  const extra = Object.keys(params).filter((k) => !allowed.includes(k));
  if (extra.length > 0)
    throw new ValidationError(`unknown params for ${kind}: ${extra.join(", ")}`);

  const jump = "jump" in params ? params.jump : undefined;
  const percent = "percent" in params ? params.percent : undefined;
  const windowRaw = "window" in params ? params.window : undefined;
  const threshold = "threshold" in params ? params.threshold : undefined;

  switch (kind) {
    case "riskJump":
      return { kind, jump: jump === undefined ? 2.5 : numberIn(jump, "jump", 0, 10, true) };
    case "riskRise":
    case "riskDecline": {
      const window = windowRaw === undefined ? 5 : parseIntField(windowRaw, "window", 1, 1000);
      return { kind, percent: numberIn(percent, "percent", 0, 1000, true), window };
    }
    case "balanceCrossUp":
    case "balanceCrossDown":
      return {
        kind,
        threshold: cents(numberIn(threshold, "threshold", -MAX_AMOUNT, MAX_AMOUNT, false)),
      };
  }
}
