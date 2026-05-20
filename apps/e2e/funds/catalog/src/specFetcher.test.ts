import { test, describe } from "node:test";
import * as assert from "node:assert";
import { fetchServiceSpecs, type FetchOptions } from "./specFetcher.js";
import type { CatalogServiceDescriptor } from "./catalogConfig.js";

function stubFetch(responses: Map<string, { status: number; body: unknown } | "error">): typeof fetch {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const r = responses.get(url);
    if (!r) throw new Error(`unexpected url: ${url}`);
    if (r === "error") throw new Error("network down");
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  };
}

const fastOpts: FetchOptions = { initialDelayMs: 1, maxDelayMs: 4, totalTimeoutMs: 20, fetchImpl: undefined };

describe("fetchServiceSpecs", () => {
  test("returns online status with both specs when endpoints succeed", async () => {
    const svc: CatalogServiceDescriptor = { id: "x", displayName: "X", baseUrl: "http://h" };
    const responses = new Map<string, { status: number; body: unknown }>();
    responses.set("http://h/openapi.json", { status: 200, body: { openapi: "3.1.0", info: { title: "x" } } });
    responses.set("http://h/asyncapi.json", { status: 200, body: { asyncapi: "3.0.0", info: { title: "x" } } });
    const result = await fetchServiceSpecs(svc, { ...fastOpts, fetchImpl: stubFetch(responses) });
    assert.strictEqual(result.status, "online");
    assert.deepStrictEqual(result.openapi, { openapi: "3.1.0", info: { title: "x" } });
    assert.deepStrictEqual(result.asyncapi, { asyncapi: "3.0.0", info: { title: "x" } });
  });

  test("returns offline status when all attempts fail within totalTimeoutMs", async () => {
    const svc: CatalogServiceDescriptor = { id: "y", displayName: "Y", baseUrl: "http://h" };
    const responses = new Map<string, "error">();
    responses.set("http://h/openapi.json", "error");
    responses.set("http://h/asyncapi.json", "error");
    const result = await fetchServiceSpecs(svc, { ...fastOpts, fetchImpl: stubFetch(responses) });
    assert.strictEqual(result.status, "offline");
    assert.strictEqual(result.openapi, null);
    assert.strictEqual(result.asyncapi, null);
    assert.ok(result.error && result.error.length > 0);
  });

  test("returns partial status when only one spec endpoint succeeds", async () => {
    const svc: CatalogServiceDescriptor = { id: "z", displayName: "Z", baseUrl: "http://h" };
    const responses = new Map<string, { status: number; body: unknown } | "error">();
    responses.set("http://h/openapi.json", { status: 200, body: { openapi: "3.1.0", info: { title: "z" } } });
    responses.set("http://h/asyncapi.json", "error");
    const result = await fetchServiceSpecs(svc, { ...fastOpts, fetchImpl: stubFetch(responses) });
    assert.strictEqual(result.status, "partial");
    assert.ok(result.openapi !== null);
    assert.strictEqual(result.asyncapi, null);
  });
});
