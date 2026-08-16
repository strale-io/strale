import { describe, expect, it } from "vitest";
import {
  classifyTransactionFailure,
  CALLER_ATTRIBUTABLE,
  type TransactionFailureClass,
} from "./transaction-failure-taxonomy.js";

/**
 * Every string in this file was taken verbatim from `transactions.error` in
 * production — a census of all 188 distinct external failure strings over 90
 * days, run 2026-08-16. Nothing here is invented, because the bug being fixed
 * was precisely that the previous patterns encoded what the messages were
 * imagined to say rather than what they say.
 *
 * The two directions are pinned separately and both matter (DEC-20260504-A):
 * excusing a real defect blinds the quality floor, and counting a correct
 * refusal delists a working capability. The second is what actually happened —
 * `us-company-data` was quarantined at "64% completion on 11 calls" while 7
 * succeeded, 1 was a genuine SEC 500, and the rest were caller input.
 */

const excused = (e: string) => CALLER_ATTRIBUTABLE.has(classifyTransactionFailure(e));
const classOf = (e: string): TransactionFailureClass => classifyTransactionFailure(e);

describe("refusals are the capability working, not failing", () => {
  it.each([
    ['No Estonian company found matching "10667868".', "estonian-company-data"],
    ['No German company found matching "example_company_name".', "german-company-data"],
    ['No French company found matching "Pooost".', "french-company-data"],
    ['No US company found matching "Braize" in SEC EDGAR.', "us-company-data"],
    ['All data providers failed for swiss-company-data: zefix-public-rest: No Swiss company found for "CHE-105.805.977"', "swiss-company-data"],
  ])("a name that matches nothing is not a defect: %s", (msg) => {
    expect(classOf(msg)).toBe("caller_input");
  });

  it.each([
    ["Country 'ZM' is not supported. Supported: AT, AU, CA, CH, DE, DK, ES, FI, FR, GB, IE, IT, NL, NO, PL, PT, SE, US.", "employment-cost-estimate"],
    ["Tax data not available for 'ZM'. Supported: SE, NO, DK, FI, DE, GB, US, FR, NL, ES, IT, PT, AT, BE, IE, CH, PL, CZ", "country-tax-rates"],
    ['Price comparison currently covers Nordic countries only (SE/NO/DK/FI) via PriceRunner. "us" is not supported — no licensed price source exists for it yet.', "price-compare"],
    ["Name search is not available via free APIs. To look up a charity by name, visit the register and provide the 'charity_number' for direct lookup.", "charity-lookup-uk"],
    ["Unknown model 'claude-sonnet-4-5'. Supported: gpt-4o, gpt-4o-mini, gpt-4-turbo", "llm-cost-calculate"],
    ["Cannot convert from 'usd' to 'eur'. Supported categories: length, weight, volume, temperature", "unit-convert"],
  ])("asking for something outside declared coverage is a refusal: %s", (msg) => {
    expect(classOf(msg)).toBe("caller_input");
  });

  it("our SSRF guard refusing a caller-supplied address is the opposite of a defect", () => {
    expect(classOf("This URL targets a restricted address.")).toBe("caller_input");
  });
});

describe("malformed input is the caller's", () => {
  it.each([
    "Invalid URL format.",
    "Invalid IP address format.",
    "Invalid JWT format. Expected 3 parts separated by dots.",
    'Invalid ABN format: "example_abn". ABN must be exactly 11 digits.',
    'Invalid label "example_name": underscore allowed only at start',
    "'from' and 'to' must be valid 3-letter ISO 4217 currency codes.",
    "'purpose' must be 'work', 'study', or 'visit'.",
    "CSV must have at least a header row and one data row.",
    "Could not parse spec as JSON or YAML. Please provide valid OpenAPI spec.",
    "Provide 'url' (e.g. https://example.com) or 'domain' (e.g. example.com) to detect the technology stack.",
  ])("%s", (msg) => {
    expect(classOf(msg)).toBe("caller_input");
  });
});

describe("the caller's own target resource", () => {
  it.each([
    "Could not fetch example.com (HTTP 403). Check the URL is correct and publicly accessible.",
    "Could not fetch example.com (HTTP 404). Check the URL is correct and publicly accessible.",
    "HTTP 404 fetching sitemap from https://example.com/sitemap.xml",
    "Failed to fetch invoice from URL: HTTP 404",
    "HTTP 403 from https://example.com",
    "HTTP 404 from https://example.com",
    "Could not access repo vercel-labs/eve. It may be private.",
    "Could not access website at example.com Verify the domain is correct.",
  ])("403/404 on a caller-supplied resource is theirs: %s", (msg) => {
    expect(classOf(msg)).toBe("caller_input");
  });

  it("but a 400 is not — that is frequently a request we malformed", () => {
    // base64-encode-url and image-resize both produce this shape. A 400 can
    // mean the caller's URL is odd, or that we built the request wrong; the
    // conservative reading keeps it counted.
    expect(excused("HTTP 400 from https://example.com")).toBe(false);
    expect(excused("Failed to fetch image: HTTP 400")).toBe(false);
  });

  it("and a 40x on one of OUR OWN outbound calls is never the caller's", () => {
    // The hazard that a generic "(could not|failed to) fetch … HTTP 40x" rule
    // creates, and the shape a systematically broken capability takes: every
    // call fails identically on a vendor path we got wrong, and every failure
    // is excused, so the floor sees a capability with no eligible calls
    // instead of a capability that is down.
    expect(excused("Could not fetch internal config (HTTP 404)")).toBe(false);
    expect(excused("Failed to fetch model list: HTTP 403")).toBe(false);
    expect(excused("Failed to fetch PDF: HTTP 404")).toBe(false);
  });

  it("and a 5xx is never the caller's, however it is phrased (review H-2)", () => {
    expect(classOf("Could not fetch example.com (HTTP 503).")).toBe("upstream");
    expect(classOf("URL returned HTTP 503")).toBe("upstream");
    expect(classOf("SEC EDGAR search returned HTTP 500")).toBe("upstream");
  });

  it("upstream is checked before the caller patterns, and a 429 proves it", () => {
    // These strings match BOTH lists — 429 is a 4xx, so the long-standing
    // "url returned http 4" caller pattern hits it, while `rate.?limit` and
    // `\b429\b` hit it upstream. Ordering is the only thing deciding, and it
    // has to decide upstream: a throttled scraping vendor is our problem to
    // manage, not evidence the caller sent something wrong. Without this the
    // check order can be swapped and every test still passes.
    expect(classOf("URL returned HTTP 429. The web scraping service is temporarily rate-limited. Please try again in a few minutes.")).toBe("upstream");
    expect(classOf("This site is rate-limiting requests (HTTP 429). The target site has throttled access.")).toBe("upstream");
    expect(excused("URL returned HTTP 429. The web scraping service is temporarily rate-limited.")).toBe(false);
  });
});

describe("our defects stay ours — the direction that blinds the floor", () => {
  it.each([
    "Expected ',' or ']' after array element in JSON at position 4672",
    "Unterminated string in JSON at position 7415",
    "Unexpected non-whitespace character after JSON at position 140",
    'Claude response parse failed (response may have been truncated). Raw: { "compressed_prompt": "Write a guide"',
    'Failed to parse enrichment result. Raw: ```json { "company_name": null }',
    'External web service screenshot returned HTTP 400: [{"message":"\\"waitForSelector\\" is not allowed"}]',
    "Too many redirects (>0) — refusing to follow further. Starting URL: https://httpbin.org/redirect/1.",
    "Page at example.com returned too little content.",
    // Internal invariant failures that a bare "must be " pattern excused.
    // These are invented rather than observed, on purpose: the bug this file
    // fixes came from writing patterns against the strings that happened to
    // exist, so the guard has to be written against the strings that could.
    "Response validation failed: output must be an object",
    "Internal assertion failed: result must be non-null",
    "Config value must be set before use",
  ])("%s", (msg) => {
    expect(excused(msg)).toBe(false);
  });

  it("an LLM payload containing caller-ish prose is still our parse failure", () => {
    // The discriminating case for INTERNAL_RE's position in the chain. The
    // model's own output is quoted verbatim, so it can contain any phrase at
    // all; classifying on the payload rather than on our diagnosis would let
    // a truncation bug excuse itself.
    const msg =
      'Claude response parse failed (response may have been truncated). ' +
      'Raw: { "note": "No company found matching that name, and the URL format is invalid" }';
    expect(classOf(msg)).toBe("internal");
    expect(excused(msg)).toBe(false);
  });
});

describe("classes that were already right stay right", () => {
  it("upstream quota and rate limiting", () => {
    expect(classOf("ReceitaWS returned HTTP 429")).toBe("upstream");
    expect(classOf("The Danish business registry API quota has been temporarily exceeded. Please try again in a few hours.")).toBe("upstream");
    expect(classOf("External service temporarily unavailable")).toBe("upstream");
  });

  it("timeouts", () => {
    expect(classOf("The operation was aborted due to timeout")).toBe("timeout");
    expect(classOf("TLS connection to example.com:443 timed out.")).toBe("timeout");
  });

  it("our own missing credentials are config, never the caller's fault", () => {
    expect(classOf("CourtListener rejected the token (HTTP 403). Verify COURTLISTENER_API_TOKEN.")).toBe("config");
    expect(excused("CourtListener rejected the token (HTTP 403). Verify COURTLISTENER_API_TOKEN.")).toBe(false);
  });

  it("route-level missing-field errors", () => {
    expect(classOf("'cik' or 'company_name' is required. Provide a CIK number or US company name.")).toBe("caller_input");
  });

  it("an empty or absent error is our problem until proven otherwise", () => {
    expect(classOf("")).toBe("internal");
    expect(classifyTransactionFailure(null)).toBe("internal");
    expect(classifyTransactionFailure(undefined)).toBe("internal");
  });
});

describe("the incident this fixes", () => {
  it("recomputes us-company-data's quarantine window as fully caller-attributable", () => {
    // The floor quarantined it on 2026-08-12 at "completion 64% on 11 eligible
    // calls/30d". Those 11 were 7 successes, 1 genuine upstream 500, and these
    // caller-input failures. Under the corrected taxonomy the eligible
    // denominator is 8, not 11, and completion is 88% — above the 70% floor.
    const callerFailures = [
      "'cik' or 'company_name' is required. Provide a CIK number or US company name.",
      'No confident SEC EDGAR match for "Apple". The closest filing belongs to a different entity ("Apple Hospitality REIT, Inc.")',
      'No US company found matching "Braize" in SEC EDGAR.',
      'No US company found matching "I cannot extract a US company name from "FIX" as it is not a request containing company information." in SEC EDGAR.',
    ];
    for (const f of callerFailures) expect(excused(f)).toBe(true);
    // …and the one real failure still counts, so the floor keeps its teeth.
    expect(excused("SEC EDGAR search returned HTTP 500")).toBe(false);
  });
});
