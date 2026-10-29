import { describe, test } from "node:test";
import * as assert from "node:assert";
import { ROOT_CONTEXT, trace } from "@opentelemetry/api";
import {
  EVDB_DEFAULT_SPANS,
  evDbTracerFor,
  getEvDbSpanPolicy,
  resolveEvDbSpanPolicy,
  setEvDbSpanPolicy,
} from "./EvDbSpanPolicy.js";

describe("EvDbSpanPolicy", () => {
  test("Given no options, When resolved, Then it equals the defaults", () => {
    assert.deepStrictEqual(resolveEvDbSpanPolicy(), EVDB_DEFAULT_SPANS);
    assert.deepStrictEqual(resolveEvDbSpanPolicy({}), EVDB_DEFAULT_SPANS);
  });

  test("Given the defaults, Then append and adapter spans are off and the rest on", () => {
    assert.deepStrictEqual(EVDB_DEFAULT_SPANS, {
      "eventualize.stream.get": true,
      "eventualize.stream.append": false,
      "eventualize.stream.store": true,
      "eventualize.stream.goToOffset": true,
      "eventualize.stream.clone": true,
      "eventualize.adapter.store": false,
      "eventualize.adapter.query.stream": false,
    });
  });

  test("Given an exact name, When resolved, Then only that span changes", () => {
    const policy = resolveEvDbSpanPolicy({ spans: { "eventualize.stream.append": true } });
    assert.deepStrictEqual(policy, { ...EVDB_DEFAULT_SPANS, "eventualize.stream.append": true });
  });

  test("Given a group wildcard, When resolved, Then every span of the group changes", () => {
    const policy = resolveEvDbSpanPolicy({ spans: { "eventualize.adapter.*": true } });
    assert.strictEqual(policy["eventualize.adapter.store"], true);
    assert.strictEqual(policy["eventualize.adapter.query.stream"], true);
    assert.strictEqual(policy["eventualize.stream.append"], false);
  });

  test("Given an exact name and its wildcard, When resolved, Then the exact name wins", () => {
    const policy = resolveEvDbSpanPolicy({
      spans: { "eventualize.adapter.*": false, "eventualize.adapter.store": true },
    });
    assert.strictEqual(policy["eventualize.adapter.store"], true);
    assert.strictEqual(policy["eventualize.adapter.query.stream"], false);
  });

  test("Given '*' and a group wildcard, When resolved, Then the group wildcard wins", () => {
    const policy = resolveEvDbSpanPolicy({
      spans: { "*": false, "eventualize.stream.*": true },
    });
    assert.strictEqual(policy["eventualize.stream.get"], true);
    assert.strictEqual(policy["eventualize.stream.append"], true);
    assert.strictEqual(policy["eventualize.adapter.store"], false);
  });

  test("Given a context without a policy, When read, Then the defaults are returned", () => {
    assert.deepStrictEqual(getEvDbSpanPolicy(ROOT_CONTEXT), EVDB_DEFAULT_SPANS);
  });

  test("Given a context with a policy, When read, Then that policy is returned", () => {
    const policy = resolveEvDbSpanPolicy({ spans: { "*": true } });
    const ctx = setEvDbSpanPolicy(ROOT_CONTEXT, policy);
    assert.deepStrictEqual(getEvDbSpanPolicy(ctx), policy);
  });

  test("Given no policy in the active context, When asking for an adapter tracer, Then a no-op tracer is returned", () => {
    const tracer = trace.getTracer("t");
    assert.notStrictEqual(evDbTracerFor("eventualize.adapter.store", tracer), tracer);
    assert.strictEqual(evDbTracerFor("eventualize.stream.store", tracer), tracer);
  });

  test("Given a policy that turns a span on, When read in its context, Then the real tracer is returned", () => {
    const tracer = trace.getTracer("t");
    const policy = resolveEvDbSpanPolicy({ spans: { "eventualize.adapter.store": true } });
    const ctx = setEvDbSpanPolicy(ROOT_CONTEXT, policy);
    assert.strictEqual(evDbTracerFor("eventualize.adapter.store", tracer, ctx), tracer);
    assert.notStrictEqual(evDbTracerFor("eventualize.adapter.query.stream", tracer, ctx), tracer);
  });
});
