// Offline: the AI SDK's own tool-calling loop (generateText + stopWhen) drives
// a mock model through strale_search then strale_execute, against a mocked
// Strale backend. No network, no key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateText, isStepCount } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { straleTools, straleExecute, CLIENT_ID } from "../src/index.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { name: string; version: string };

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function mockBackend(routes: Record<string, (body: unknown) => [number, unknown]>) {
  const seen: Seen[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const method = init?.method ?? "GET";
    seen.push({ method, url: url.toString(), headers, body });
    const handler = routes[`${method} ${url.pathname}`];
    const [status, payload] = handler ? handler(body) : [404, { error_code: "not_found", message: "no route" }];
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, seen };
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

/** A model that searches, then executes the first hit with fixed inputs, then answers. */
function scriptedModel(inputs: Record<string, unknown>) {
  let step = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        return {
          content: [{ type: "tool-call", toolCallId: "c1", toolName: "strale_search", input: JSON.stringify({ query: "uk company lookup" }) }],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        };
      }
      if (step === 2) {
        return {
          content: [{ type: "tool-call", toolCallId: "c2", toolName: "strale_execute", input: JSON.stringify({ slug: "uk-company-data", inputs }) }],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        };
      }
      return { content: [{ type: "text", text: "done" }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
    },
  });
}

const catalogueRoutes = {
  "GET /v1/suggest/typeahead": () => [200, {
    total: 1,
    results: [{ type: "capability", slug: "uk-company-data", name: "UK Company Data", description: "Companies House lookup", category: "data-extraction", price_cents: null, geography: "uk" }],
  }] as [number, unknown],
  "GET /v1/capabilities/uk-company-data": () => [200, {
    slug: "uk-company-data",
    price_cents: 5,
    input_schema: { type: "object", properties: { company_number: { type: "string" } } },
  }] as [number, unknown],
};

test("client id is derived from package.json", () => {
  assert.equal(CLIENT_ID, `${pkg.name}/${pkg.version}`);
});

test("generateText runs search then execute over the API-key rail", async () => {
  const { fetchImpl, seen } = mockBackend({
    ...catalogueRoutes,
    "POST /v1/do": () => [200, {
      result: { transaction_id: "tx-1", status: "completed", price_cents: 5, latency_ms: 120, output: { company_name: "EXAMPLE LTD" }, provenance: { source: "companies-house" } },
    }],
  });
  const result = await generateText({
    model: scriptedModel({ company_number: "00000006" }),
    prompt: "Look up UK company 00000006",
    tools: straleTools({ apiKey: "sk_test_x", fetch: fetchImpl, maxPriceCents: 50 }),
    stopWhen: isStepCount(5),
  });

  assert.equal(result.text, "done");
  assert.equal(result.steps.length, 3);
  const toolResults = result.steps.flatMap((s) => s.toolResults);
  assert.deepEqual(toolResults.map((r) => r.toolName), ["strale_search", "strale_execute"]);

  const search = toolResults[0]!.output as { ok: boolean; results: Array<{ slug: string; price_cents: number; input_schema: unknown }> };
  assert.equal(search.ok, true);
  assert.equal(search.results[0]!.slug, "uk-company-data");
  assert.equal(search.results[0]!.price_cents, 5, "price filled from the detail endpoint");
  assert.deepEqual(search.results[0]!.input_schema, { type: "object", properties: { company_number: { type: "string" } } });

  const exec = toolResults[1]!.output as Record<string, unknown>;
  assert.equal(exec.ok, true);
  assert.equal(exec.rail, "api_key");
  assert.deepEqual(exec.output, { company_name: "EXAMPLE LTD" });
  assert.equal(exec.transaction_id, "tx-1");

  // Every request carries the attribution header; only the paid call carries the key.
  assert.ok(seen.length >= 3);
  for (const r of seen) assert.equal(r.headers["x-strale-client"], CLIENT_ID);
  const doCall = seen.find((r) => r.url.endsWith("/v1/do"))!;
  assert.equal(doCall.headers.authorization, "Bearer sk_test_x");
  assert.deepEqual(doCall.body, { capability_slug: "uk-company-data", inputs: { company_number: "00000006" }, max_price_cents: 50 });
  assert.equal(seen.find((r) => r.url.includes("/typeahead"))!.headers.authorization, undefined);
});

test("without a key, the x402 fetch carries the paid call", async () => {
  const plain = mockBackend(catalogueRoutes);
  const paying = mockBackend({
    "POST /x402/uk-company-data": () => [200, { company_name: "EXAMPLE LTD", _meta: { payment: { method: "x402", price_usd: 0.06 } } }],
  });
  const result = await generateText({
    model: scriptedModel({ company_number: "00000006" }),
    prompt: "Look up UK company 00000006",
    tools: straleTools({ apiKey: "", fetch: plain.fetchImpl, x402Fetch: paying.fetchImpl }),
    stopWhen: isStepCount(5),
  });
  const exec = result.steps.flatMap((s) => s.toolResults)[1]!.output as Record<string, unknown>;
  assert.equal(exec.rail, "x402");
  assert.deepEqual(exec.output, { company_name: "EXAMPLE LTD" });
  assert.equal(paying.seen.length, 1);
  assert.equal(paying.seen[0]!.headers["x-strale-client"], CLIENT_ID);
  assert.equal(paying.seen[0]!.headers.authorization, undefined);
  assert.deepEqual(paying.seen[0]!.body, { company_number: "00000006" });
  assert.ok(plain.seen.every((r) => !r.url.includes("/x402/")));
});

test("anonymous paid call returns a readable payment error, not a throw", async () => {
  const { fetchImpl, seen } = mockBackend({
    "POST /v1/do": () => [401, { error_code: "unauthorized", message: "API key required", details: { fix: "Send Authorization: Bearer" } }],
  });
  const execute = straleExecute({ apiKey: "", fetch: fetchImpl }).execute!;
  const out = (await execute({ slug: "uk-company-data", inputs: { company_number: "1" } }, { toolCallId: "t", messages: [] } as never)) as Record<string, unknown>;
  assert.equal(out.ok, false);
  assert.equal(out.error_code, "unauthorized");
  assert.equal(out.fix, "Send Authorization: Bearer");
  assert.match(String(out.how_to_pay), /x402/);
  assert.equal(seen[0]!.headers.authorization, undefined);
});

test("solutions route to the solution endpoint", async () => {
  const { fetchImpl, seen } = mockBackend({
    "POST /v1/solutions/kyb-essentials-uk/execute": () => [200, { result: { transaction_id: "tx-2", price_cents: 150, steps: [{ capability: "uk-company-data" }] } }],
  });
  const execute = straleExecute({ apiKey: "sk_test_x", fetch: fetchImpl }).execute!;
  const out = (await execute({ slug: "kyb-essentials-uk", type: "solution", inputs: { company_number: "1" } }, { toolCallId: "t", messages: [] } as never)) as Record<string, unknown>;
  assert.equal(out.ok, true);
  assert.equal(out.price_cents, 150);
  assert.deepEqual(seen[0]!.body, { inputs: { company_number: "1" }, max_price_cents: 200 });
});

const ctx = { toolCallId: "t", messages: [] } as never;

test("a free tool not on the x402 rail still runs when x402Fetch is set", async () => {
  const plain = mockBackend({
    "POST /v1/do": () => [200, { result: { output: { valid: true }, price_cents: 0 } }],
  });
  const paying = mockBackend({});
  const execute = straleExecute({ apiKey: "", fetch: plain.fetchImpl, x402Fetch: paying.fetchImpl }).execute!;
  const out = (await execute({ slug: "iban-validate", inputs: { iban: "x" } }, ctx)) as Record<string, unknown>;
  assert.equal(out.ok, true);
  assert.equal(out.rail, "free");
  assert.equal(paying.seen.length, 1, "tried x402 first");
  assert.equal(plain.seen[0]!.headers.authorization, undefined);
});

test("a paying fetch that refuses returns a readable error", async () => {
  const plain = mockBackend({});
  const refusing = (async () => { throw new Error("Payment amount exceeds maximum allowed"); }) as typeof fetch;
  const execute = straleExecute({ apiKey: "", fetch: plain.fetchImpl, x402Fetch: refusing }).execute!;
  const out = (await execute({ slug: "uk-company-data", inputs: {} }, ctx)) as Record<string, unknown>;
  assert.equal(out.ok, false);
  assert.equal(out.error_code, "x402_client_error");
  assert.match(String(out.message), /exceeds maximum/);
});

test("a solution whose steps all failed is not reported as ok", async () => {
  const { fetchImpl } = mockBackend({
    "POST /v1/solutions/kyb-essentials-uk/execute": () => [200, { result: { status: "failed", price_cents: 0, steps: [], errors: ["uk-company-data: upstream down"] } }],
  });
  const execute = straleExecute({ apiKey: "sk_test_x", fetch: fetchImpl }).execute!;
  const out = (await execute({ slug: "kyb-essentials-uk", type: "solution", inputs: {} }, ctx)) as Record<string, unknown>;
  assert.equal(out.ok, false);
  assert.deepEqual(out.errors, ["uk-company-data: upstream down"]);
});

test("a key holder's 402 carries no how-to-pay hint; an anonymous solution hint names the solution route", async () => {
  const { fetchImpl } = mockBackend({
    "POST /v1/solutions/kyb-essentials-uk/execute": () => [402, { error_code: "insufficient_balance", message: "Top up" }],
  });
  const keyed = (await straleExecute({ apiKey: "sk_test_x", fetch: fetchImpl }).execute!({ slug: "kyb-essentials-uk", type: "solution", inputs: {} }, ctx)) as Record<string, unknown>;
  assert.equal(keyed.how_to_pay, undefined);
  const anon = (await straleExecute({ apiKey: "", fetch: fetchImpl }).execute!({ slug: "kyb-essentials-uk", type: "solution", inputs: {} }, ctx)) as Record<string, unknown>;
  assert.match(String(anon.how_to_pay), /\/x402\/solutions\/kyb-essentials-uk/);
});

test("maxPriceCents outside 1..2000 is refused at construction", () => {
  for (const bad of [0, -1, 2001, 1.5]) assert.throws(() => straleTools({ maxPriceCents: bad }), RangeError);
  assert.doesNotThrow(() => straleTools({ maxPriceCents: 2000 }));
});

test("a timeout or network failure on the x402 route is thrown, not reported as a refusal", async () => {
  const plain = mockBackend({});
  for (const err of [new DOMException("timed out", "TimeoutError"), new TypeError("fetch failed")]) {
    const failing = (async () => { throw err; }) as typeof fetch;
    const execute = straleExecute({ apiKey: "", fetch: plain.fetchImpl, x402Fetch: failing }).execute!;
    await assert.rejects(execute({ slug: "uk-company-data", inputs: {} }, ctx), (e) => e === err);
  }
});
