/**
 * #436 — the three health consumers must agree by construction, not by
 * somebody remembering to update three places.
 *
 * The defect this closes: one array, `REFUSAL_MESSAGE_PATTERNS`, was matched
 * three different ways.
 *
 *   - `isRefusalMessage` — `startsWith`, case-sensitive
 *   - `circuit-breaker.ts` — spread into its own list, `includes`,
 *     case-sensitive
 *   - `transaction-failure-taxonomy.ts` — spread into a RegExp as trimmed
 *     pattern SOURCES, unanchored, case-INsensitive
 *
 * A fragment could therefore satisfy one consumer and silently miss another.
 * It did, twice: #428 (the breaker recognised no byte-limit refusal at all)
 * and #434 (an entry satisfied the breaker and missed quality-capture). Both
 * were repaired by adding another string, which left the mechanism intact.
 *
 * Now there is one predicate. These tests prove the three consumers agree on
 * every registered pattern and on the house style, that the negative
 * controls still fail all three, and — structurally — that no fourth matcher
 * can appear without failing CI.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";

import {
  CALLER_FIELD_REFUSAL_SOURCE,
  CapabilityRefusalError,
  isCapabilityRefusal,
  isRefusalMessage,
  REFUSAL_MESSAGE_PATTERNS,
} from "./capability-refusal.js";
import { isUserInputError } from "./circuit-breaker.js";
import {
  classifyTransactionFailure,
  countsAgainstCapability,
} from "./transaction-failure-taxonomy.js";
import { categorizeError } from "./quality-capture.js";
import { ResourceLimitError } from "./resource-limits.js";

/**
 * The three consumers, asked the same question three ways. `agree` is what
 * every assertion below reduces to — a refusal must be all three or none.
 */
function verdicts(message: string) {
  const cls = classifyTransactionFailure(message);
  return {
    breakerExcuses: isUserInputError(message),
    qualityBucket: categorizeError(message),
    taxonomyClass: cls,
    floorExcuses: !countsAgainstCapability(cls),
  };
}

const expectRecognisedEverywhere = (message: string, why: string) => {
  const v = verdicts(message);
  expect(v.breakerExcuses, `${why}: circuit breaker would count it`).toBe(true);
  expect(v.qualityBucket, `${why}: quality capture bucketed it wrong`).toBe("capability_refusal");
  expect(v.taxonomyClass, `${why}: taxonomy classified it wrong`).toBe("caller_input");
  expect(v.floorExcuses, `${why}: the quality floor would count it`).toBe(true);
};

// ─── Every registered pattern, through every consumer ────────────────────────

describe("every registered refusal pattern is recognised by all three consumers", () => {
  it.each(REFUSAL_MESSAGE_PATTERNS.map((p) => [p] as const))("%s", (pattern) => {
    // The fragments are message OPENERS by contract, so a real message is the
    // fragment plus a tail. Building it this way is the point: if a fragment
    // is ever registered that is not an opener, this fails rather than
    // half-working.
    expectRecognisedEverywhere(`${pattern}rest of the sentence.`, `pattern "${pattern}"`);
  });
});

// ─── The house style, recognised by shape ────────────────────────────────────

describe("the house style is recognised by shape, not by registration", () => {
  const HOUSE_STYLE = [
    // page-speed-test. This one needed a bespoke registered fragment in #434;
    // the house-style rule is what made that entry unnecessary.
    "'url' must be a page PageSpeed Insights can load. Lighthouse could not fetch https://x.test.",
    "'strategy' must be 'mobile' or 'desktop'.",
    "'url' must be a page whose HTML is 16.0MB or less.",
    "'target_width' must be 10000px or less (received 40000px).",
    "'from' and 'to' must be valid 3-letter ISO 4217 currency codes.",
  ];

  it.each(HOUSE_STYLE)("%s", (message) => {
    expectRecognisedEverywhere(message, "house style");
  });

  it("the taxonomy and the refusal predicate share ONE definition of the shape", () => {
    // Not "both happen to accept these strings" — the same source string is
    // compiled into both, so they cannot diverge.
    const taxonomySrc = readFileSync(resolve(__dirname, "transaction-failure-taxonomy.ts"), "utf-8");
    expect(taxonomySrc).toContain("CALLER_FIELD_REFUSAL_SOURCE");
    expect(taxonomySrc, "the taxonomy kept its own copy of the house-style regex").not.toContain(
      "\"^'[^']{1,40}'",
    );
    expect(CALLER_FIELD_REFUSAL_SOURCE).toBe("^'[^']{1,40}'.{0,40}must be ");
  });
});

// ─── Typed refusals ──────────────────────────────────────────────────────────

describe("typed refusals are recognised through the object as well as the string", () => {
  it("CapabilityRefusalError", () => {
    const err = new CapabilityRefusalError("Ambiguous company name: 3 registered entities match.");
    expect(isCapabilityRefusal(err)).toBe(true);
    expectRecognisedEverywhere(err.message, "CapabilityRefusalError");
  });

  it("ResourceLimitError", () => {
    const err = new ResourceLimitError("'url' must be a page whose HTML is 16.0MB or less.");
    expect(isCapabilityRefusal(err)).toBe(true);
    expect(categorizeError(err)).toBe("capability_refusal");
    expectRecognisedEverywhere(err.message, "ResourceLimitError");
  });
});

// ─── Negative controls ───────────────────────────────────────────────────────

describe("things that must NOT be excused as refusals", () => {
  const NOT_REFUSALS: Array<[string, string]> = [
    ["provider 5xx", "PageSpeed Insights returned HTTP 500: Lighthouse returned error: Something went wrong."],
    ["upstream unavailable", "Companies House returned a server error (HTTP 503)."],
    ["our own assertion", "Internal assertion failed: result must be non-null"],
    ["our own validation", "Response validation failed: output must be an object"],
    ["our own config", "Config value must be set before use"],
    ["transport fault", "fetch failed"],
    // The shape the old divergence turned on: a registered fragment appearing
    // in the MIDDLE of a message rather than opening it. The breaker used to
    // excuse this (substring) while quality capture did not (startsWith).
    // Neither does now.
    ["fragment only mid-message", 'Company "Ambiguous Holdings Ltd" could not be resolved by the registry.'],
    ["fragment mid-message, byte-limit wording", "Internal error while formatting: value was MB or less than expected"],
  ];

  it.each(NOT_REFUSALS)("%s", (_label, message) => {
    expect(isRefusalMessage(message), "refusal predicate claimed it").toBe(false);
    expect(categorizeError(message), "quality capture called it a refusal").not.toBe(
      "capability_refusal",
    );
    expect(classifyTransactionFailure(message), "taxonomy called it caller input").not.toBe(
      "caller_input",
    );
  });

  it("a provider 5xx still counts against the capability, in all three", () => {
    const msg = "PageSpeed Insights returned HTTP 500: Lighthouse returned error: Something went wrong.";
    expect(isUserInputError(msg)).toBe(false);
    expect(countsAgainstCapability(classifyTransactionFailure(msg))).toBe(true);
    expect(categorizeError(msg)).toBe("upstream_error");
  });
});

// ─── Structural: no fourth matcher ───────────────────────────────────────────

describe("structural: the pattern array has exactly one matching implementation", () => {
  /**
   * What actually caused #428 and #434 was not a wrong pattern — it was that
   * `REFUSAL_MESSAGE_PATTERNS` could be imported and matched by any rule a
   * consumer felt like. Behavioural tests cannot see a fourth consumer that
   * has not been written yet; this can.
   */
  const SRC = resolve(__dirname, "..");
  const ALLOWED = new Set(["lib/capability-refusal.ts"]);

  function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, acc);
      else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) acc.push(full);
    }
    return acc;
  }

  /**
   * IMPORTS, not textual mentions. The first version of this test matched the
   * identifier anywhere in the file and flagged `capabilities/lib/
   * llm-extract.ts`, which only names it in a docstring explaining why its
   * message starts with a registered prefix. Prose about the authority is
   * exactly what we want more of; a second matcher is what we want none of.
   */
  function importsThePatternArray(file: string): boolean {
    const src = readFileSync(file, "utf-8");
    if (!src.includes("REFUSAL_MESSAGE_PATTERNS")) return false;
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
    let found = false;
    const visit = (node: ts.Node): void => {
      if (
        ts.isImportSpecifier(node) &&
        (node.propertyName ?? node.name).text === "REFUSAL_MESSAGE_PATTERNS"
      ) {
        found = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
  }

  it("only capability-refusal.ts consumes the raw pattern array", () => {
    const offenders = walk(SRC)
      .filter(importsThePatternArray)
      .map((f) => relative(SRC, f).split(sep).join("/"))
      .filter((p) => !ALLOWED.has(p));
    expect(
      offenders,
      "import isRefusalMessage instead of matching the patterns yourself — that is how #428 and #434 happened",
    ).toEqual([]);
  });

  it("the three consumers reach the authority, not a copy of it", () => {
    const read = (p: string) => readFileSync(resolve(__dirname, p), "utf-8");
    expect(read("circuit-breaker.ts")).toMatch(/isRefusalMessage\(/);
    expect(read("transaction-failure-taxonomy.ts")).toMatch(/isRefusalMessage\(/);
    expect(read("quality-capture.ts")).toMatch(/isCapabilityRefusal\(/);
  });
});
