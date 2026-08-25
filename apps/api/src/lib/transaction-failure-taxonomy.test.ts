import { describe, expect, it } from "vitest";
import {
  classifyTransactionFailure,
  countsAgainstCapability,
  CALLER_ATTRIBUTABLE,
  UNATTRIBUTED,
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
    "Could not parse spec as JSON or YAML. Please provide valid OpenAPI spec.",
    "Provide 'url' (e.g. https://example.com) or 'domain' (e.g. example.com) to detect the technology stack.",
  ])("%s", (msg) => {
    expect(classOf(msg)).toBe("caller_input");
  });

  it.each([
    // Real refusals that are DELIBERATELY not excused, because no shape
    // separates them from an internal failure saying the same thing.
    // "CSV must have at least a header row" vs "Result must have at least one
    // row"; "Name search is not available via free APIs" vs "Service is
    // temporarily not available via API". On a path where under-counting
    // blinds the armed quality floor, the tie goes to counting.
    //
    // Both are cheap to fix at the throw site instead: lead with the quoted
    // field, as the rest of the house style does. Listed here so the cost is
    // visible rather than discovered later as a mystery.
    "CSV must have at least a header row and one data row.",
    "Name search is not available via free APIs. To look up a charity by name, visit the register and provide the 'charity_number' for direct lookup.",
  ])("deliberately still counted, reword at the throw site to change this: %s", (msg) => {
    expect(excused(msg)).toBe(false);
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

  it.each([
    // Every string here came from the cross-provider review (sol@high,
    // 2026-08-16), which found three over-broad patterns the census-derived
    // tests could not see — because the tests and the patterns were written
    // from the same source. These are the shapes a SYSTEMATICALLY broken
    // capability takes: every call fails identically, and if the failure is
    // excused, the floor stops seeing the capability at all.
    'The "chunk" argument must be of type string or an instance of Buffer. Received undefined',
    "Invalid response format",
    "Failed to fetch company registry API: HTTP 403",
    "HTTP 403 from Companies House API",
    "Service is temporarily not available via API",
    "Digest method is not supported",
    "Result must have at least one row",
  ])("review-found hazard stays ours: %s", (msg) => {
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

  it("an empty or absent error is an evidence shortfall, not our defect", () => {
    // Reversed with LESSONS.md F1 step 4. It read `internal` before, on the
    // premise "our problem until proven otherwise" - so a failed call with no
    // error text at all became evidence of a defect purely because nothing
    // matched. That premise is the common cause of all seven F1 incidents.
    expect(classOf("")).toBe("unclassified");
    expect(classifyTransactionFailure(null)).toBe("unclassified");
    expect(classifyTransactionFailure(undefined)).toBe("unclassified");
    // And it must not be laundered into "the caller's fault" either: the two
    // are different statements and only one of them is a claim about anyone.
    expect(excused("")).toBe(false);
    expect(countsAgainstCapability(classOf(""))).toBe(false);
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

describe("LLM output-truncation refusal (2026-08-17 web-extract quarantine incident)", () => {
  // web-extract calls Claude Haiku with a fixed max_tokens and never checked
  // stop_reason. A ~100-name roster page hit the cap, the response came back
  // truncated mid-JSON, extractJsonObject correctly returned null (unbalanced
  // braces), and the capability threw "Failed to parse extraction result as
  // JSON. Raw response: ...". INTERNAL_RE's "failed to parse" match classified
  // that as `internal` — our fault — and the armed quality floor
  // (DEC-20260812-A) quarantined a revenue-earning capability over its own
  // truncation bug. web-extract.ts and product-reviews-extract.ts now detect
  // `stop_reason === "max_tokens"` and throw a distinct, actionable refusal
  // BEFORE attempting to parse, instead of letting it fall through to the
  // generic parse-failure error.

  const WEB_EXTRACT_TRUNCATION_REFUSAL =
    "Extraction result too large for one call: the output exceeded the per-call budget before completing. " +
    "Narrow your 'extract' instruction or split the request (e.g. one page or one section at a time).";

  const PRODUCT_REVIEWS_TRUNCATION_REFUSAL =
    "Extraction result too large for one call: the output exceeded the per-call budget before completing. " +
    "Try a page with fewer reviews — this capability extracts up to ~10 recent reviews per call.";

  it("classifies the new truncation refusal as caller_input, not internal — the whole point of the fix", () => {
    expect(classOf(WEB_EXTRACT_TRUNCATION_REFUSAL)).toBe("caller_input");
    expect(excused(WEB_EXTRACT_TRUNCATION_REFUSAL)).toBe(true);
    expect(classOf(PRODUCT_REVIEWS_TRUNCATION_REFUSAL)).toBe("caller_input");
    expect(excused(PRODUCT_REVIEWS_TRUNCATION_REFUSAL)).toBe(true);
  });

  it("the legacy generic parse-failure message — genuinely malformed, non-truncation output — still classifies as internal (must not regress)", () => {
    // This is the exact message shape that caused the 2026-08-17 quarantine.
    // It must keep classifying as `internal`: web-extract.ts only throws it
    // now for non-truncation parse failures, which really are our defect
    // (bad prompt, model went off-script) and must keep counting against the
    // capability so the floor retains its teeth for a genuine regression.
    const legacyMessage =
      'Failed to parse extraction result as JSON. Raw response: {"data": {"headline": "broken';
    expect(classOf(legacyMessage)).toBe("internal");
    expect(excused(legacyMessage)).toBe(false);
  });

  it("does not misfire on INTERNAL_RE's own patterns — the new phrase shares no vocabulary with 'failed to parse' or 'response parse failed'", () => {
    // Guards the ordering requirement directly: INTERNAL_RE runs before
    // CALLER_INPUT_RE, so if the new refusal text ever drifted to contain
    // "parse" it would silently flip back to `internal`.
    expect(WEB_EXTRACT_TRUNCATION_REFUSAL).not.toMatch(/failed to parse|response parse failed|in JSON at position|unterminated string/i);
    expect(PRODUCT_REVIEWS_TRUNCATION_REFUSAL).not.toMatch(/failed to parse|response parse failed|in JSON at position|unterminated string/i);
  });

  it("is recognised through the shared CapabilityRefusalError machinery, not a bespoke taxonomy-only pattern", async () => {
    // The pattern is registered once, in capability-refusal.ts's
    // REFUSAL_MESSAGE_PATTERNS, and taxonomy.ts's CALLER_INPUT_RE spreads it
    // in — the same three-consumer arrangement (breaker / taxonomy /
    // quality-capture) the registry-refusal patterns already use.
    const { isRefusalMessage, isCapabilityRefusal, CapabilityRefusalError } = await import(
      "./capability-refusal.js"
    );
    const { isUserInputError } = await import("./circuit-breaker.js");
    const { categorizeError } = await import("./quality-capture.js");

    expect(isRefusalMessage(WEB_EXTRACT_TRUNCATION_REFUSAL)).toBe(true);
    expect(isCapabilityRefusal(WEB_EXTRACT_TRUNCATION_REFUSAL)).toBe(true);
    expect(isUserInputError(WEB_EXTRACT_TRUNCATION_REFUSAL)).toBe(true);
    expect(categorizeError(WEB_EXTRACT_TRUNCATION_REFUSAL)).toBe("capability_refusal");

    const err = new CapabilityRefusalError(WEB_EXTRACT_TRUNCATION_REFUSAL);
    expect(isCapabilityRefusal(err)).toBe(true);
    expect(categorizeError(err)).toBe("capability_refusal");
  });
});

/**
 * 2026-08-22 — the `url-to-markdown` quarantine.
 *
 * Same shape as the `us-company-data` incident pinned above, one rail along:
 * a capability that had refused correctly was delisted for it, and this one
 * was a free-tier front door, so the delisting also broke the no-signup
 * promise the 401 body was still making.
 *
 * Both directions are pinned. The excused strings are the capability
 * reporting a property of the caller's chosen page; the counted ones are
 * operations that did not complete, whoever's fault that is.
 */
describe("a page with nothing in it is the caller's URL, not our defect", () => {
  it("a measured-empty target page is caller_input", () => {
    const msg =
      "This page returned almost no readable text (0 words). It may require JavaScript to render its content, or the URL may point to a login page.";
    expect(classOf(msg)).toBe("caller_input");
    expect(excused(msg)).toBe(true);
  });

  it("but a bare 'too little content' shrug stays ours", () => {
    // Pinned by an earlier review and left alone. It claims nothing about
    // what was inspected, so it reads equally as our own fetch under-reading
    // the page. The line the fix draws is a MEASURED property of the target,
    // not any complaint about emptiness.
    expect(excused("Page at [service] returned too little content.")).toBe(false);
  });

  it("still counts the failures that were in the same quarantine window", () => {
    // The operation did not complete. By this module's own rule that is ours
    // to carry, whatever caused it — so these must NOT be excused, or the
    // floor goes blind on exactly the capability it just mis-judged.
    const notExcused = [
      "Could not extract content from this page ([service].uk). The web page ([service].uk) could not be loaded (HTTP 400).",
      "This site is rate-limiting requests (HTTP 429). The target site has throttled access. Try again in a few minutes.",
    ];
    for (const msg of notExcused) expect(excused(msg)).toBe(false);
  });

  it("does not excuse our own empty-output defects as the caller's fault", () => {
    // The pattern is anchored to one house phrasing. A generic claim about
    // emptiness in OUR OWN pipeline must never be excused as caller input -
    // these are the assertions that fail if the caller rule is ever loosened
    // to `no readable` or `returned too little`.
    //
    // The assertion is on `excused`, not on the class. Since F1 step 4 these
    // land in `unclassified` rather than `internal`: no rule recognises them,
    // and the honest record of that is "I could not attribute this". They are
    // invented probe strings rather than observed production text, so there is
    // nothing to anchor a positive `internal` rule to; if either shape ever
    // shows up in the census it earns a rule in INTERNAL_RE with its call
    // count attached. What matters here, and what is pinned, is that the
    // caller boundary does not move.
    for (const msg of [
      "Extraction pipeline returned too little data to build a result.",
      "Internal renderer produced no readable output for the requested page.",
    ]) {
      expect(classOf(msg)).toBe("unclassified");
      expect(excused(msg)).toBe(false);
    }
  });

  it("reproduces the floor arithmetic the fix changes", () => {
    // The exact 30-day population the quality floor saw on 2026-08-22,
    // verbatim from production. Before the fix: 15 eligible, 10 completed,
    // 66.7% — below the 70% quarantine floor. After: the no-content refusal
    // leaves the denominator and it clears.
    const failures = [
      "This page returned almost no readable text (0 words). It may require JavaScript to render its content, or the URL may point to a login page.",
      "Could not extract content from this page ([service].uk). The web page ([service].uk) could not be loaded (HTTP 400).",
      "Could not extract content from this page ([service].uk). The web page ([service].uk) could not be loaded (HTTP 400).",
      "This site is rate-limiting requests (HTTP 429). The target site has throttled access. Try again in a few minutes.",
      "This site is rate-limiting requests (HTTP 429). The target site has throttled access. Try again in a few minutes.",
    ];
    const completed = 10;
    const counted = failures.filter((e) => !excused(e)).length;
    expect(counted).toBe(4);
    expect(completed / (completed + counted)).toBeGreaterThanOrEqual(0.7);
  });
});

/**
 * LESSONS.md F1 step 4 — the default direction, not another string patch.
 *
 * The family reached seven incidents because six repairs widened the
 * caller-attributable *coverage* while the *default* stayed "ours". These
 * tests pin the default itself, and every one of them fails against the
 * un-fixed module: before the change the fallback returned "internal", so each
 * `unclassified` assertion here would read "internal" and each
 * `countsAgainstCapability` assertion would read `true`.
 */
describe("the default is a shortfall, not an accusation (F1 step 4)", () => {
  // Verbatim from `scripts/f1-failure-attribution.ts`, 90-day census: the
  // three largest shapes in the 47,582-call `internal` bucket that no rule
  // claimed. 29.2% of that bucket is the bare transport error alone.
  const unrecognised = [
    "fetch failed",
    "TypeError: fetch failed",
    "terminated",
  ];

  it("an error string no rule recognises is unclassified, never internal", () => {
    // "TypeError: fetch failed" is the one exception in this set and it is
    // deliberate: it carries a V8 error name, which IS positive evidence our
    // own code threw, so INTERNAL_RE claims it. The bare transport strings
    // carry no such evidence and must not be guessed at.
    expect(classOf("fetch failed")).toBe("unclassified");
    expect(classOf("terminated")).toBe("unclassified");
    expect(classOf("TypeError: fetch failed")).toBe("internal");
  });

  it("unclassified failures leave the capability's denominator", () => {
    for (const msg of unrecognised.filter((m) => classOf(m) === "unclassified")) {
      expect(countsAgainstCapability(classOf(msg))).toBe(false);
    }
  });

  it("unclassified is NOT the caller's fault either — the two are different claims", () => {
    // The distinction is the whole point. "Not the capability's fault" and
    // "nothing here says whose fault this was" are opposite operator
    // situations, and collapsing the second into the first would hide an
    // evidence shortfall behind a verdict.
    expect(excused("fetch failed")).toBe(false);
    expect(CALLER_ATTRIBUTABLE.has("unclassified" as TransactionFailureClass)).toBe(false);
    expect(UNATTRIBUTED.has("unclassified")).toBe(true);
  });

  it("still sees our own code crashing — the class the change must not blind", () => {
    // If inverting the default had left INTERNAL_RE alone, every runtime crash
    // would have become `unclassified` and the floor would have stopped
    // counting real defects. That is the failure mode this change could have
    // introduced, so it is pinned harder than the rest.
    for (const msg of [
      "TypeError: Cannot read properties of undefined (reading 'items')",
      "ReferenceError: capabilityRegistry is not defined",
      "RangeError: Invalid array length",
      "resolveCountry is not a function",
      "result.rows is not iterable",
    ]) {
      expect(classOf(msg)).toBe("internal");
      expect(countsAgainstCapability(classOf(msg))).toBe(true);
    }
  });

  it("does not steal strings the other classes already claim", () => {
    // Ordering regression guard. INTERNAL_RE runs BEFORE timeout, upstream and
    // caller-input, so widening it risks claiming their traffic. Each of these
    // is a class the census assigns elsewhere and must keep.
    expect(classOf("Companies House returned HTTP 503")).toBe("upstream");
    expect(classOf("Request timed out after 35000ms")).toBe("timeout");
    expect(classOf("Verify COURTLISTENER_API_TOKEN.")).toBe("config");
    expect(classOf('No Estonian company found matching "10667868".')).toBe("caller_input");
    // "internal server error" is the upstream's phrasing, not evidence about
    // our code, and it is the string most likely to be captured by a careless
    // widening of INTERNAL_RE. The assertion is that INTERNAL_RE does NOT
    // claim it — which is the property under test.
    //
    // What it lands in instead is `unclassified`, and that is worth writing
    // down rather than asserting away: UPSTREAM_RE reads
    // `service.*(?:down|error)`, so it needs the literal word "service" and
    // this phrasing has none. The taxonomy has no rule for a bare "internal
    // server error". Before F1 step 4 that gap was invisible because the
    // fallback swallowed it as our defect; now it shows up as a shortfall,
    // which is the intended behaviour of the change and the mechanism by
    // which the gap gets found and fixed from the census.
    expect(classOf("Registry returned an internal server error")).not.toBe("internal");
    expect(classOf("Registry returned an internal server error")).toBe("unclassified");
  });
});
