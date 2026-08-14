/**
 * Regression tests for search-query aliases (2026-08-05).
 *
 * Origin: `suggest_log` for 2026-07-20 → 2026-08-05 recorded 17 zero-result
 * typeahead queries. Some were genuine coverage gaps, but several were pure
 * vocabulary mismatches — most starkly `fx`, which returned nothing while
 * `forex` returned forex-history and `currency` returned four capabilities
 * including exchange-rate. The catalog had the answer; only the word differed.
 *
 * These tests pin two things: that the known-bad queries now expand, and —
 * equally important — that genuine coverage gaps are NOT aliased into false
 * matches. Sending a caller to a capability that does not do what they asked
 * is worse than an honest empty result.
 */

import { describe, it, expect } from "vitest";
import {
  aliasTermsFor,
  SEARCH_ALIASES,
  ALIAS_PRIMARY_WEIGHT,
  ALIAS_SECONDARY_WEIGHT,
} from "./search-aliases.js";
import { tokenize } from "./tokenize.js";

describe("aliasTermsFor", () => {
  it('expands "fx" to the terms the catalog actually uses (the bug case)', () => {
    const terms = aliasTermsFor(["fx"]);
    // exchange-rate tokenizes to exchange/rate, so "exchange" is the bridge.
    expect(terms.has("exchange")).toBe(true);
    expect(terms.has("forex")).toBe(true);
    expect(terms.has("currency")).toBe(true);
  });

  it('expands "visa" to reach work-permit-requirements', () => {
    expect(aliasTermsFor(["visa"]).has("permit")).toBe(true);
    expect(aliasTermsFor(["immigration"]).has("permit")).toBe(true);
    expect(aliasTermsFor(["relocation"]).has("permit")).toBe(true);
  });

  it('expands "logging" to "log", which prefix matching cannot reach', () => {
    // The typed word is LONGER than the token, so startsWith() never fires.
    expect("log".startsWith("logging")).toBe(false);
    expect(aliasTermsFor(["logging"]).has("log")).toBe(true);
  });

  it("expands every word of a multi-word query", () => {
    const terms = aliasTermsFor(["relocation", "visa", "immigration"]);
    expect(terms.has("permit")).toBe(true);
  });

  it("does not return a term the user already typed", () => {
    // "currency" aliases to exchange/forex; typing both must not double-count.
    const terms = aliasTermsFor(["currency", "forex"]);
    expect(terms.has("forex")).toBe(false);
    expect(terms.has("currency")).toBe(false);
    expect(terms.has("exchange")).toBe(true);
  });

  it("returns nothing for words with no alias", () => {
    expect(aliasTermsFor(["email", "validation"]).size).toBe(0);
    expect(aliasTermsFor([]).size).toBe(0);
  });

  it("does not alias genuine coverage gaps into false matches", () => {
    // No capability serves these under any name. An empty result is the
    // honest answer; these belong on the roadmap, not in the alias map.
    for (const gap of ["itinerary", "vacation", "reminder", "incident", "rewrite", "africa"]) {
      expect(aliasTermsFor([gap]).size, `${gap} should not be aliased`).toBe(0);
    }
  });
});

describe("alias map integrity", () => {
  it("keys and values are single lowercase tokens that survive tokenize()", () => {
    // A multi-word or punctuated entry would never match, since matching is
    // done against tokenize() output.
    for (const [key, values] of Object.entries(SEARCH_ALIASES)) {
      expect([...tokenize(key)], `key "${key}"`).toEqual([key]);
      for (const v of values) {
        expect([...tokenize(v)], `value "${v}" of "${key}"`).toEqual([v]);
      }
    }
  });

  it("no alias maps a word to itself", () => {
    for (const [key, values] of Object.entries(SEARCH_ALIASES)) {
      expect(values, `"${key}" maps to itself`).not.toContain(key);
    }
  });

  it("alias weights stay below a direct hit so literal matches win", () => {
    expect(ALIAS_PRIMARY_WEIGHT).toBeLessThan(1);
    expect(ALIAS_SECONDARY_WEIGHT).toBeLessThan(ALIAS_PRIMARY_WEIGHT);
    expect(ALIAS_SECONDARY_WEIGHT).toBeGreaterThan(0);
  });

  it("a name match outranks a description-only mention", () => {
    // Why the split exists: with one flat weight, "fx" ranked
    // swift-message-parse (mentions currency in prose) above exchange-rate,
    // whose name IS the answer.
    const exchangeRate = ALIAS_PRIMARY_WEIGHT; // "exchange" in the name
    const swiftParse = ALIAS_SECONDARY_WEIGHT * 2; // currency + exchange in prose
    expect(exchangeRate).toBeGreaterThan(swiftParse);
  });
});
