import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { apiError, recoveryDetails, type ErrorCode } from "./errors.js";
import * as refusals from "./capability-refusal.js";

const routeFiles = ["do", "solution-execute", "solutions", "auth", "wallet", "api-keys", "suggest", "capabilities", "audit", "dispute", "transactions", "verify", "x402-gateway-v2", "internal-onboarding", "internal-health-monitor"];
const callerCodes = new Set(["invalid_request", "unauthorized", "primary_key_required", "active_key_limit_exceeded", "key_hourly_cap_exceeded", "key_total_cap_exceeded", "insufficient_balance", "budget_exceeded", "no_matching_capability", "not_found", "spend_cap_exceeded", "rate_limited", "idempotency_key_reused", "request_in_progress", "latency_threshold_exceeded", "freshness_check_failed", "token_expired", "legacy_token_sunset", "payment_failed"]);
afterEach(() => vi.useRealTimers());

// Evaluate the actual error-producing expressions, with deterministic request /
// DB values. Never import the route graph or connect to a database. This checks
// each refusal site, including its supplied details, rather than only code defaults.
function evaluate(n: ts.Expression, source: ts.SourceFile): any {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isNumericLiteral(n)) return Number(n.text);
  if (n.kind === ts.SyntaxKind.NullKeyword) return null;
  if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map(s => String(evaluate(s.expression, source)) + s.literal.text).join("");
  if (ts.isObjectLiteralExpression(n)) return Object.fromEntries(n.properties.filter(ts.isPropertyAssignment).map(p => [ts.isStringLiteral(p.name) ? p.name.text : p.name.getText(source), evaluate(p.initializer, source)]));
  if (ts.isArrayLiteralExpression(n)) return n.elements.map(e => evaluate(e as ts.Expression, source));
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) return evaluate(n.left, source) + evaluate(n.right, source);
  if (ts.isConditionalExpression(n)) return evaluate(n.whenTrue, source);
  if (ts.isCallExpression(n) && n.expression.getText(source) === "recoveryDetails") return recoveryDetails(evaluate(n.arguments[0], source), evaluate(n.arguments[1], source), n.arguments[2] ? evaluate(n.arguments[2], source) : undefined);
  const name = n.getText(source);
  if (name === "errorCode") return "invalid_request";
  if (/missingFields|expectedFields/.test(name) && !name.includes(".")) return ["email"];
  if (name === "MIN_TOPUP_CENTS") return 100;
  if (name === "MAX_TOPUP_CENTS") return 10000;
  if (name.endsWith("retryAfterSeconds")) return 30;
  if (name === "assessment.message") return "Disposable email addresses are not accepted.";
  // Dynamic expressions don't execute during this source contract walk. Real
  // route tests below cover representative branches with concrete values.
  return "example";
}

describe("route-level caller-fixable inventory", () => {
  for (const file of [...routeFiles.map(f => `routes/${f}`), "lib/middleware", "lib/rate-limit", "lib/db-rate-limit", "lib/api-keys", "lib/admin-auth"]) {
    const text = readFileSync(new URL(`../${file}.ts`, import.meta.url), "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const calls: ts.CallExpression[] = [];
    const walk = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === "apiError") calls.push(node);
      ts.forEachChild(node, walk);
    };
    walk(source);
    for (const call of calls) {
      const code = evaluate(call.arguments[0], source) as ErrorCode;

      const line = source.getLineAndCharacterOfPosition(call.getStart()).line + 1;
      it(`${file}:${line} ${code} has the appropriate recovery advice`, () => {
        const message = evaluate(call.arguments[1], source);
        const details = call.arguments[2] ? evaluate(call.arguments[2], source) : undefined;
        const result = apiError(code, message, details).details!;
        if (callerCodes.has(code) && !details?.next_step) expect(result.fix).toEqual(expect.stringMatching(/\S/));
        else expect(result).toMatchObject({ retryable: expect.any(Boolean), next_step: expect.stringMatching(/\S/) });
        if (code === "invalid_request" && !file.includes("internal-")) {
          // Each validation branch must give specific advice, not rely on the
          // generic unknown-validation fallback.
          expect(details?.fix).toEqual(expect.stringMatching(/\S/));
          expect(details.fix).not.toContain("Correct the request fields");
        }
      });
    }
  }
});

it("retains explicit refusal metadata and does not expose unknown diagnostics", () => {
  const refusal = refusals.inputRefusal("'corporate_number' must be 13 digits.", "corporate_number", "Send 'corporate_number' as 13 digits.");
  expect(refusals.isCapabilityRefusal(refusal)).toBe(true);
  expect(refusals.refusalDetails(refusal)).toEqual({ field: "corporate_number", fix: "Send 'corporate_number' as 13 digits.", retryable: false });
  expect(refusals.refusalDetails(new Error("private diagnostics"))).toBeUndefined();
  const details = refusals.refusalDetails("Ambiguous company name with private diagnostics");
  expect(details?.fix).toEqual(expect.stringMatching(/unambiguous identifier/));
  expect(JSON.stringify(details)).not.toContain("private diagnostics");
});

it("preserves existing details and derives a real retry time", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  expect(apiError("rate_limited", "Rate limit exceeded.", { retry_after_seconds: 37, limit: 10 })).toMatchObject({ details: { fix: "Retry after 2026-10-27T12:00:37.000Z.", retry_after_seconds: 37, limit: 10 } });
  expect(apiError("execution_failed", "Execution failed.").details).toEqual({ retryable: true, next_step: expect.any(String) });
});

it("common error envelopes remain stable with additive advice", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  expect([
    apiError("insufficient_balance", "Wallet balance is too low.", { wallet_balance_cents: 0, required_cents: 5 }),
    apiError("invalid_request", "Missing required input fields: email", { missing_fields: ["email"] }),
    apiError("rate_limited", "Rate limit exceeded.", { retry_after_seconds: 10 }),
    apiError("no_matching_capability", "No capability found matching your request within budget."),
    apiError("unauthorized", "Invalid API key."),
    apiError("key_total_cap_exceeded", "This key's total spend limit would be exceeded.", { spent_cents: 10, requested_cents: 5, limit_cents: 10, retryable: false }),
  ]).toMatchSnapshot();
});

const executorSlugs = ["email-validate", "iban-validate", "vat-validate", "phone-validate", "url-to-markdown", "pdf-extract", "web-extract", "dns-lookup", "ssl-check", "sanctions-check", "pep-check", "adverse-media-check", "address-parse", "currency-convert", "uk-company-data", "french-company-data", "japanese-company-data", "company-id-detect", "company-news", "company-tech-stack", "email-auth-check", "email-deliverability-check", "email-reputation-score", "domain-age-check", "csv-to-json", "csv-clean", "deduplicate", "date-parse", "business-day-check", "address-validate"];
it.each(executorSlugs)("%s rejects invalid input with a field and fix before any upstream call", async slug => {
  const fetch = vi.fn(() => { throw new Error("Unexpected upstream call"); });
  vi.stubGlobal("fetch", fetch);
  try {
    const loaders: Record<string, () => Promise<unknown>> = {
      "email-validate": () => import("../capabilities/email-validate.js"),
      "iban-validate": () => import("../capabilities/iban-validate.js"),
      "vat-validate": () => import("../capabilities/vat-validate.js"),
      "phone-validate": () => import("../capabilities/phone-validate.js"),
      "url-to-markdown": () => import("../capabilities/url-to-markdown.js"),
      "pdf-extract": () => import("../capabilities/pdf-extract.js"),
      "web-extract": () => import("../capabilities/web-extract.js"),
      "dns-lookup": () => import("../capabilities/dns-lookup.js"),
      "ssl-check": () => import("../capabilities/ssl-check.js"),
      "sanctions-check": () => import("../capabilities/sanctions-check.js"),
      "pep-check": () => import("../capabilities/pep-check.js"),
      "adverse-media-check": () => import("../capabilities/adverse-media-check.js"),
      "address-parse": () => import("../capabilities/address-parse.js"),
      "currency-convert": () => import("../capabilities/currency-convert.js"),
      "uk-company-data": () => import("../capabilities/uk-company-data.js"),
      "french-company-data": () => import("../capabilities/french-company-data.js"),
      "japanese-company-data": () => import("../capabilities/japanese-company-data.js"),
      "company-id-detect": () => import("../capabilities/company-id-detect.js"),
      "company-news": () => import("../capabilities/company-news.js"),
      "company-tech-stack": () => import("../capabilities/company-tech-stack.js"),
      "email-auth-check": () => import("../capabilities/email-auth-check.js"),
      "email-deliverability-check": () => import("../capabilities/email-deliverability-check.js"),
      "email-reputation-score": () => import("../capabilities/email-reputation-score.js"),
      "domain-age-check": () => import("../capabilities/domain-age-check.js"),
      "csv-to-json": () => import("../capabilities/csv-to-json.js"),
      "csv-clean": () => import("../capabilities/csv-clean.js"),
      "deduplicate": () => import("../capabilities/deduplicate.js"),
      "date-parse": () => import("../capabilities/date-parse.js"),
      "business-day-check": () => import("../capabilities/business-day-check.js"),
      "address-validate": () => import("../capabilities/address-validate.js"),
    };
    await loaders[slug]();
    const { getExecutor } = await import("../capabilities/index.js");
    const executor = getExecutor(slug);
    expect(executor).toBeTypeOf("function");
    let error: unknown;
    try { await executor!(slug === "currency-convert" ? { amount: -1 } : {}); } catch (err) { error = err; }
    expect(error).toBeInstanceOf(refusals.CapabilityRefusalError);
    expect(error).toMatchObject({ details: { field: expect.stringMatching(/\S/), fix: expect.stringMatching(/\S/) } });
    expect(refusals.refusalDetails(error)).toMatchObject({ field: expect.stringMatching(/\S/), fix: expect.stringMatching(/\S/), retryable: false });
    expect(fetch).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

it("MCP tool text exposes the API fix", async () => {
  const fix = "Send 'email' as a non-empty string.";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error_code: "invalid_request", message: "Email required.", details: { fix, field: "email" } }), { status: 400, headers: { "Content-Type": "application/json" } })));
  try {
    const { executeCapability } = await import("strale-mcp/tools");
    const result = await executeCapability("email-validate", {}, { baseUrl: "https://api.example.test", apiKey: "synthetic", maxPriceCents: 100 });
    expect(result.content[0].text).toContain(`Fix: ${fix}`);
  } finally { vi.unstubAllGlobals(); }
});

it.each(["rate_limited", "key_hourly_cap_exceeded", "key_total_cap_exceeded"])("MCP retains %s advice instead of replacing it with a free-tier signup message", async code => {
  const fix = "Ask the owner to raise the key limit.";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error_code: code, message: "Limit exceeded.", details: { fix, retryable: false } }), { status: 429, headers: { "Content-Type": "application/json" } })));
  try {
    const { executeCapability } = await import("strale-mcp/tools");
    const result = await executeCapability("email-validate", {}, { baseUrl: "https://api.example.test", apiKey: "synthetic", maxPriceCents: 100 });
    expect(result.content[0].text).toContain(`Fix: ${fix}`);
    expect(result.content[0].text).toContain(code);
    expect(result.content[0].text).not.toContain("Free tier rate limit reached");
  } finally { vi.unstubAllGlobals(); }
});

for (const name of ["x402-gateway-v2", "a2a", "mcp"]) {
  const source = ts.createSourceFile(name, readFileSync(new URL(`../routes/${name}.ts`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const walk = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const props = node.properties.filter(ts.isPropertyAssignment);
      const get = (key: string) => props.find(p => p.name.getText(source) === key)?.initializer;
      const legacy = name === "x402-gateway-v2" && get("error") && ts.isCallExpression(node.parent) && node.parent.expression.getText(source) === "c.json";
      const rpc = name !== "x402-gateway-v2" && get("code") && get("message");
      if (legacy || rpc) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        it(`${name}:${line} retains recovery guidance in its protocol envelope`, () => {
          const expression = legacy ? get("details") : get("data");
          expect(expression, "protocol error has structured recovery advice").toBeDefined();
          // schemaBadRequest calls the shared policy at runtime; its dynamic
          // invalid_request / execution_failed split is exercised separately.
          if (expression && ts.isObjectLiteralExpression(expression)) {
            const value = evaluate(expression, source);
            const details = legacy ? value : value.details;
            if (details.fix) expect(details.fix).toEqual(expect.stringMatching(/\S/));
            else expect(details).toMatchObject({ retryable: expect.any(Boolean), next_step: expect.stringMatching(/\S/) });
          }
        });
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
}

it("optional fields and alternatives never become required_fields", () => {
  const error = apiError("invalid_request", "Provide one identifier.", { expected_fields: ["name", "id", "optional"] });
  expect(error.details?.required_fields).toBeUndefined();
  expect(apiError("freshness_check_failed", "Stale reference data.").details).toMatchObject({ fix: expect.stringContaining("require_fresh"), retryable: false });
  expect(apiError("unauthorized", "Audit token required. Include ?token=<hmac> in the URL.").details?.fix).toContain("expires_at");
  expect(apiError("unauthorized", "Audit token required.").details?.fix).not.toContain("Authorization: Bearer");
  for (const code of ["token_expired", "legacy_token_sunset"] as const) expect(apiError(code, "Audit URL expired.").details?.fix).toContain("POST /v1/transactions/:id/audit-token");
});

it.each([
  ["business-day-check", { date: "not-a-date", country_code: "SE" }, "date"],
  ["csv-clean", { csv: '""' }, "csv"],
  ["csv-to-json", { csv_string: " \n " }, "csv_string"],
  ["email-auth-check", { domain: 42 }, "domain"],
  ["email-auth-check", { domain: "192.0.2.1" }, "domain"],
  ["email-auth-check", { domain: "!bad!" }, "domain"],
])("%s carries advice for invalid non-empty input", async (slug, input, field) => {
  const { getExecutor } = await import("../capabilities/index.js");
  const fetch = vi.fn(() => { throw new Error("Unexpected upstream call"); }); vi.stubGlobal("fetch", fetch);
  try {
    let error: unknown;
    try { await getExecutor(String(slug))!(input as Record<string, unknown>); } catch (err) { error = err; }
    expect(error).toMatchObject({ details: { field, fix: expect.stringContaining(String(field)) } });
    expect(fetch).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

it("x402 schema errors name alternatives and retain native refusal advice", async () => {
  const { Hono } = await import("hono");
  const { schemaBadRequest } = await import("../routes/x402-gateway-v2.js");
  const app = new Hono();
  const schema = { properties: { company_name: { type: "string" }, org_number: { type: "string" }, optional: { type: "string" } }, anyOf: [{ required: ["company_name"] }, { required: ["org_number"] }] };
  app.get("/schema", c => schemaBadRequest(c, "Provide 'company_name' or 'org_number'.", schema));
  app.get("/refusal", c => schemaBadRequest(c, "Invalid number.", schema, "execution_failed", refusals.refusalDetails(refusals.inputRefusal("Invalid number.", "org_number", "Send 'org_number' as 9 digits."))));
  const response = await app.request("/schema"); const body = await response.json();
  expect(response.status).toBe(400);
  expect(body.error_code).toBe("invalid_request");
  expect(body.details.fix).toContain("'company_name' or 'org_number'");
  expect(body.details.any_of).toEqual(schema.anyOf);
  expect(body.details.required_fields).toBeUndefined();
  expect(await (await app.request("/refusal")).json()).toMatchObject({ error_code: "execution_failed", charged: false, details: { field: "org_number", fix: "Send 'org_number' as 9 digits.", retryable: false } });
});

for (const name of ["do", "solution-execute", "x402-gateway-v2"]) {
  const source = ts.createSourceFile(name, readFileSync(new URL(`../routes/${name}.ts`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const walk = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const props = node.properties.filter(ts.isPropertyAssignment);
      const code = props.find(p => p.name.getText(source) === "error_code")?.initializer;
      if (code) {
        it(`${name} raw ${evaluate(code, source)} envelope names recovery advice`, () => {
          const details = props.find(p => p.name.getText(source) === "details")?.initializer;
          expect(details).toBeDefined();
          const value = evaluate(details!, source);
          if (callerCodes.has(evaluate(code, source))) expect(value.fix).toEqual(expect.stringMatching(/\S/));
          else expect(value).toMatchObject({ retryable: expect.any(Boolean), next_step: expect.stringMatching(/\S/) });
        });
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
}

it.each(["1", "2"])("the v%s /v1/do payment challenge names its payment header", async version => {
  vi.stubEnv("X402_CHALLENGE_VERSION", version);
  try {
    const { build402Response } = await import("./x402-gateway.js");
    const response = build402Response({ slug: "example", name: "Example", priceCents: 5 });
    expect(response.status).toBe(402);
    expect(response.body.x402Version).toBe(Number(version));
    expect((response.body.details as Record<string, unknown>).fix).toContain(version === "1" ? "X-PAYMENT" : "PAYMENT-SIGNATURE");
    expect(response.body.accepts).toBeInstanceOf(Array);
  } finally { vi.unstubAllEnvs(); }
});
