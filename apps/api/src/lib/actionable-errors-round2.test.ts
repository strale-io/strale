import { afterEach, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";
import { load } from "js-yaml";
import { apiError, recoveryDetails } from "./errors.js";
import { CapabilityRefusalError, refusalDetails } from "./capability-refusal.js";
import { categorizeError } from "./quality-capture.js";
import { anyStepRetryable, stepFailure, stepFailureEntries, type StepFailure } from "./solution-step-failure.js";
import { targetUnavailable } from "./upstream-result.js";

function source(file: string) {
  return ts.createSourceFile(file, readFileSync(new URL(`../${file}.ts`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
}
function nodes<T extends ts.Node>(file: ts.SourceFile, predicate: (n: ts.Node) => n is T): T[] {
  const found: T[] = [];
  const walk = (n: ts.Node) => { if (predicate(n)) found.push(n); ts.forEachChild(n, walk); };
  walk(file); return found;
}
function run(n: ts.Node, file: ts.SourceFile, bindings: Record<string, unknown> = {}) {
  return new Function(...Object.keys(bindings), `return (${n.getText(file)});`)(...Object.values(bindings));
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

for (const file of ["lib/admin-auth", "routes/internal-health-monitor", "routes/internal-onboarding"]) {
  const src = source(file);
  const calls = nodes(src, ts.isCallExpression).filter(n => n.expression.getText(src) === "apiError" && n.arguments[0]?.getText(src) === '"unauthorized"');
  it(`${file} supplies admin recovery without customer-key advice`, () => {
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const details = run(call, src, { apiError }).details;
      expect(details).toMatchObject({ retryable: false, next_step: expect.stringMatching(/admin|operator/i) });
      expect(details.fix).toBeUndefined();
      expect(JSON.stringify(details)).not.toMatch(/auth\/recover|API key/);
    }
  });
}

it.each(["", "synthetic"])("MCP preserves the 429 funnel event with apiKey=%s", async apiKey => {
  const onFunnelEvent = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error_code: "rate_limited", message: "Limit reached.", details: { fix: "Retry after reset." } }), { status: 429 })));
  const { executeCapability } = await import("strale-mcp/tools");
  const result = await executeCapability("email-validate", {}, { apiKey, baseUrl: "https://example.test", maxPriceCents: 100, onFunnelEvent });
  expect(onFunnelEvent).toHaveBeenCalledExactlyOnceWith({ type: "rate_limited", tool: "strale_execute", slug: "email-validate" });
  if (!apiKey) {
    expect(result.content[0].text).toContain("https://strale.io/signup");
    expect(result.content[0].text).toContain("paid access");
    expect(result.content[0].text).not.toContain("€2");
  }
});

it.each([
  "Example: Terms of Service prohibit automated access",
  "robots.txt disallows this path; Strale stops at a site's block",
])("access refusal gives a different-source fix: %s", message => {
  expect(refusalDetails(message)).toMatchObject({ retryable: false, fix: "Choose a different URL or source; this site does not permit automated access." });
});
it("bare refusal text never treats a caller-supplied domain as a field", () => {
  const error = new CapabilityRefusalError("'foo.com' is not a valid domain name.");
  expect(refusalDetails(error)).not.toHaveProperty("field");
  expect(refusalDetails("'domain' must be a DNS hostname.")).toHaveProperty("field", "domain");
});
it("legacy caller-input execution errors are not retryable", () => {
  expect(apiError("execution_failed", "Execution failed.", { error: "Invalid email address" }).details).toMatchObject({ retryable: false, fix: "Correct the input per the tool's input_schema at GET /v1/capabilities/:slug and resend." });
});

// Follow-up 42: the bundle is retryable only when it was refunded AND a retry
// could change at least one failed step; each step keeps its own advice.
function solutionDetails(refundRequired: boolean, outcomeRetryable: boolean, failures: StepFailure[], stop: { gated?: object; withheldStep?: boolean } = {}) {
  const src = source("routes/solution-execute");
  const prop = nodes(src, ts.isPropertyAssignment).find(n => n.name.getText(src) === "details" && n.getText(src).includes("stepFailureEntries(execResult.failures)"))!;
  const decl = nodes(src, ts.isVariableDeclaration).find(n => n.name.getText(src) === "bundleRetryable")!;
  const execResult = { errors: failures.map(f => `${f.capability_slug}: x`), failures };
  const bundleRetryable = run(decl.initializer!, src, { refundRequired, outcome: { retryable: outcomeRetryable }, anyStepRetryable, execResult });
  return run(prop.initializer, src, { refundRequired, bundleRetryable, stepFailureEntries, execResult, gated: stop.gated, withheldStep: stop.withheldStep ?? false });
}
const transient = stepFailure("vat-validate", new Error("HTTP 503"));
const siteRefusal = stepFailure("meta-extract", targetUnavailable("URL", 404));
const inputFix = stepFailure("link-extract", new CapabilityRefusalError("'url' must be an absolute URL.", { field: "url", fix: "Send 'url' as an absolute https URL." }));
it.each([true, false])("solution retry advice follows refundRequired=%s", refundRequired => {
  const details = solutionDetails(refundRequired, true, [transient]);
  expect(details.retryable).toBe(refundRequired);
  const src = source("routes/solution-execute");
  const price = nodes(src, ts.isVariableDeclaration).find(n => n.name.getText(src) === "chargedPrice")!;
  expect(run(price.initializer!, src, { refundRequired, sol: { priceCents: 25 } })).toBe(refundRequired ? 0 : 25);
  expect(details.next_step).toMatch(refundRequired ? /refund.*retry/i : /rerun.*charges the solution price again/i);
  expect(details.errors).toEqual([{ capability_slug: "vat-validate", ...transient.details }]);
});
it("a refunded bundle whose every step a retry cannot change is not retryable, and keeps each step's advice", () => {
  const details = solutionDetails(true, true, [siteRefusal, inputFix]);
  expect(details.retryable).toBe(false);
  expect(details.next_step).toMatch(/refunded.*will not change/i);
  expect(details.errors).toEqual([
    expect.objectContaining({ capability_slug: "meta-extract", retryable: false }),
    expect.objectContaining({ capability_slug: "link-extract", retryable: false, field: "url", fix: "Send 'url' as an absolute https URL." }),
  ]);
});
it("one retryable step makes a refunded bundle retryable", () => {
  expect(solutionDetails(true, true, [siteRefusal, transient]).retryable).toBe(true);
});
it("a tripped gate is final even when a failed step was transient, and the advice names the gate", () => {
  const details = solutionDetails(true, false, [transient], { gated: { capabilitySlug: "vat-validate" } });
  expect(details.retryable).toBe(false);
  expect(details.next_step).toMatch(/refunded.*gate stops a retry/i);
  expect(details.next_step).not.toMatch(/will not change the failed steps/);
});
it("a withheld step is final even when another failed step was transient, and the advice says Strale withheld it", () => {
  const details = solutionDetails(true, false, [transient], { withheldStep: true });
  expect(details.retryable).toBe(false);
  expect(details.next_step).toMatch(/refunded.*withheld a step/i);
});
it("a step the platform stopped (withheld, not deployed, guarded refusal) advises no retry", () => {
  const withheld = stepFailure("vat-validate", "capability is not currently servable", { final: true });
  expect(withheld.details).toMatchObject({ retryable: false, error: "capability is not currently servable" });
  expect(withheld.details.next_step).toMatch(/same answer/);
  expect(anyStepRetryable([withheld])).toBe(false);
});
it("account spend cap advice points to support", () => {
  expect(apiError("spend_cap_exceeded", "Limit.").details?.fix).toBe("Wait until the rolling hourly spend is below 'limit_cents', or contact support to change the account limit.");
});
it("unknown client IP requires a standard HTTP client", () => {
  const src = source("lib/db-rate-limit");
  const call = nodes(src, ts.isCallExpression).find(n => n.expression.getText(src) === "apiError" && n.arguments[1]?.getText(src).includes("Unable to determine client IP"))!;
  expect(run(call, src, { apiError }).details).toMatchObject({ retryable: false, fix: expect.stringMatching(/standard HTTP client.*exposes the client IP/) });
});
it("x402 schema advice ends with one period", async () => {
  const { Hono } = await import("hono");
  const { schemaBadRequest } = await import("../routes/x402-gateway-v2.js");
  const app = new Hono(); app.get("/", c => schemaBadRequest(c, "Invalid input.", {}));
  expect((await (await app.request("/")).json()).details.fix).not.toContain("..");
});

// These errors retain their wording; the typed refusal now attributes them to
// the caller. Historical string-only quality rows are deliberately untouched.
it.each([
  "Name must be at least 2 characters for sanctions screening.",
  "Name must be at least 2 characters for PEP screening.",
  "Name must be at least 2 characters for adverse media screening.",
  "Invalid date format. Use YYYY-MM-DD.",
  "CSV is empty.",
  "CSV has no data rows.",
  "'email' is required.",
  'Invalid URL: "bad".',
  "IP addresses have no email-authentication DNS records — provide a domain name.",
])("quality accounting attributes input refusal: %s", message => {
  expect(categorizeError(new CapabilityRefusalError(message))).toBe("capability_refusal");
  expect(categorizeError(message)).toBe("internal_error");
});
it.each([
  ["HTTP 503", "upstream_error"], ["timeout", "upstream_timeout"],
  ["rate limit", "rate_limited"], ["validation failed", "schema_mismatch"],
  ["Unexpected bug", "internal_error"],
])("other quality categories stay unchanged: %s", (message, category) => {
  expect(categorizeError(message)).toBe(category);
});

for (const file of readdirSync(new URL("../capabilities/", import.meta.url)).filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
  const src = source(`capabilities/${file.slice(0, -3)}`);
  for (const call of nodes(src, ts.isCallExpression).filter(n => n.expression.getText(src) === "inputRefusal")) {
    it(`${file}:${src.getLineAndCharacterOfPosition(call.getStart()).line + 1} fix names its field and accepted format`, () => {
      const bindings = { k: "domain" };
      const field = run(call.arguments[1], src, bindings);
      const fix = run(call.arguments[2], src, bindings);
      expect(fix).toContain(`'${field}'`);
      expect(fix).toMatch(/^Send /);
      expect(fix).not.toMatch(/Send Name|non-empty value matching|uk companies house|with a (?:json|csv|iban|vat|url|siren)/);
      expect(fix).toMatch(/\.$/);
      const manifest = load(readFileSync(new URL(`../../../../manifests/${file.slice(0, -3)}.yaml`, import.meta.url), "utf8")) as { input_schema: { properties: Record<string, unknown> } };
      for (const [, name] of fix.matchAll(/'([a-z][a-z0-9_]*)'/g)) expect(manifest.input_schema.properties).toHaveProperty(name);
      if (file === "french-company-data.ts") {
        expect(fix).toContain("'siren' as a 9-digit SIREN or 14-digit SIRET");
        expect(fix).toContain("'company_name' as a company name");
      }
    });
  }
}

it.each(["french-company-data", "uk-company-data"])("%s schema exposes the company-name alternative", slug => {
  const manifest = load(readFileSync(new URL(`../../../../manifests/${slug}.yaml`, import.meta.url), "utf8")) as { input_schema: { properties: Record<string, unknown>; required?: string[]; anyOf: unknown[] } };
  expect(manifest.input_schema.properties.company_name).toMatchObject({ type: "string" });
  expect(manifest.input_schema.anyOf).toContainEqual({ required: ["company_name"] });
  expect(manifest.input_schema.required).toBeUndefined();
});
