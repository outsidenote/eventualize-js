import { test, describe } from "node:test";
import * as assert from "node:assert";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { statusFor } from "./errorHandler.js";

describe("statusFor", () => {
  test("maps domain errors", () => {
    assert.strictEqual(statusFor(new ValidationError("x")), 400);
    assert.strictEqual(statusFor(new NotFoundError("x")), 404);
    assert.strictEqual(statusFor(new ConflictError("x")), 409);
  });

  test("unrelated RangeError and SyntaxError are 500", () => {
    assert.strictEqual(statusFor(new RangeError("x")), 500);
    assert.strictEqual(statusFor(new SyntaxError("x")), 500);
  });

  test("4xx status attached by Express is used", () => {
    assert.strictEqual(statusFor(Object.assign(new Error("x"), { status: 413 })), 413);
  });

  test("5xx or non-numeric status is 500", () => {
    assert.strictEqual(statusFor(Object.assign(new Error("x"), { status: 503 })), 500);
    assert.strictEqual(statusFor(Object.assign(new Error("x"), { status: "400" })), 500);
  });
});
