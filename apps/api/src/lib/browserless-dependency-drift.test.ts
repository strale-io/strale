/**
 * Drift detector for dependency-manifest.ts's curated `browserless.capabilities`
 * list — the "genuinely requires Browserless, no fallback" set now shared by
 * credential-health.ts (skip-when-credential-missing) and
 * upstream-health-gate.ts's getBrowserlessDependentSlugs()
 * (skip-when-provider-unhealthy), both via the shared
 * getCuratedProviderCapabilities() accessor.
 *
 * Background (2026-08-18, fix/credential-health-browserless-staleness):
 * credential-health.ts used to carry its OWN hand-maintained 52-slug array.
 * By the time this was audited, at least 15 of those 52 slugs had migrated
 * off Browserless entirely (irish/latvian/lithuanian/swiss-company-data per
 * DEC-20260428-A, plus austrian/belgian/danish/dutch/eu-regulation-search/
 * german/italian/portuguese/spanish/swedish-company-data/tech-stack-detect —
 * never reconciled after their own migrations) and 4 more had no executor at
 * all (credit-report-summary deactivated, custom-scrape never built,
 * hong-kong/indian-company-data probed but never shipped). A hand-maintained
 * list silently drifts every time a capability migrates off (or onto)
 * Browserless; a test that reads the actual executor source is the only
 * thing that can't go stale the same way.
 *
 * This file checks BOTH directions:
 *   1. over-inclusion — every slug currently in the curated list must show
 *      real hard-require evidence in its executor (direct getBrowserlessConfig
 *      / buildBrowserlessRequestUrl usage, or skipFallback: true). Catches
 *      exactly the staleness this fix addresses: a slug that migrated off
 *      Browserless but was never removed from the curated list.
 *   2. under-inclusion — every capability executor that actually shows
 *      hard-require evidence must be listed in the curated list. Catches the
 *      opposite drift: a capability that starts hard-requiring Browserless
 *      (e.g. drops its plain-fetch/Jina fallback) without the curated list
 *      being updated, which would silently under-skip it during a real
 *      Browserless outage.
 *
 * Fallback-tier capabilities (web-provider.ts's fetchPage/fetchRenderedHtml
 * with default options) are deliberately NOT asserted against by name here —
 * that would just be a second hand-maintained list. The two scans above are
 * the whole test; anything not flagged by either is presumed correctly
 * fallback-tier or untouched by Browserless.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { getCuratedProviderCapabilities } from "./dependency-manifest.js";

const CAPABILITIES_DIR = resolve(import.meta.dirname, "../capabilities");

/**
 * Hard-require evidence: reaching Browserless with no fallback tier able to
 * rescue the call. Four spellings, all verified against web-provider.ts:
 *
 *   1-2. Direct config/URL construction — bypasses the tiered layer outright.
 *   3.   `skipFallback: true` — explicitly disables tiers 1-2.
 *   4.   A non-`networkidle0` `waitUntil` — the tier-1 (plain fetch) and
 *        tier-2 (Jina) branches are BOTH gated on the default wait mode
 *        (web-provider.ts ~345 / ~424), so any other value silently skips
 *        straight to Browserless. `fetchCompanyPage()` is exactly this case:
 *        it hardcodes `waitUntil: "domcontentloaded"`, so it is a hard
 *        dependency despite reading like an innocuous helper (external
 *        review, 2026-08-18 — the original three-token pattern missed it).
 *
 * Matched against comment-stripped source: a stale comment mentioning
 * `getBrowserlessConfig` must not keep an obsolete slug alive in the curated
 * list, and a commented-out call must not invent a new dependency.
 */
const HARD_REQUIRE_PATTERN =
  /getBrowserlessConfig|buildBrowserlessRequestUrl|skipFallback\s*:\s*true|fetchCompanyPage\s*\(|waitUntil\s*:\s*["'](?!networkidle0)/;

/** Strip line and block comments so only real code is pattern-matched. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Every top-level capabilities/*.ts file that self-registers an executor,
 * read from disk exactly once and keyed by its registered slug (not
 * assumed to equal the filename). Both the over- and under-inclusion checks
 * below read from this map instead of re-opening files — a slug's source
 * text is on disk only once for the whole suite, not once per check.
 */
function loadExecutorSources(): Map<string, string> {
  const files = readdirSync(CAPABILITIES_DIR).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts" && f !== "auto-register.ts",
  );
  const bySlug = new Map<string, string>();
  for (const f of files) {
    const text = readFileSync(resolve(CAPABILITIES_DIR, f), "utf8");
    const m = text.match(/registerCapability\(\s*"([^"]+)"/);
    if (m) bySlug.set(m[1], stripComments(text));
  }
  return bySlug;
}

const EXECUTOR_SOURCES = loadExecutorSources();
const CURATED_BROWSERLESS_SLUGS = getCuratedProviderCapabilities("browserless");

describe("dependency-manifest.ts browserless.capabilities — drift detector", () => {
  it("every curated slug's executor shows real hard-require Browserless evidence (over-inclusion / staleness check)", () => {
    const stale: Array<{ slug: string; reason: string }> = [];
    for (const slug of CURATED_BROWSERLESS_SLUGS) {
      const source = EXECUTOR_SOURCES.get(slug);
      if (source === undefined) {
        stale.push({ slug, reason: "no executor file at src/capabilities/<slug>.ts registering that slug" });
        continue;
      }
      if (!HARD_REQUIRE_PATTERN.test(source)) {
        stale.push({
          slug,
          reason:
            "executor exists but shows no direct getBrowserlessConfig/buildBrowserlessRequestUrl " +
            "call and no skipFallback: true — this looks like a fallback-tier or migrated-off " +
            "capability that should be removed from dependency-manifest.ts's browserless.capabilities",
        });
      }
    }
    expect(stale, JSON.stringify(stale, null, 2)).toEqual([]);
  });

  it("every executor with hard-require Browserless evidence is in the curated list (under-inclusion check)", () => {
    const curated = new Set(CURATED_BROWSERLESS_SLUGS);
    // Carries the matched evidence, symmetrically with the over-inclusion
    // check above: a bare slug list tells a future engineer WHAT failed but
    // not WHY, leaving them to re-derive the pattern match by hand.
    const missing: Array<{ slug: string; evidence: string; reason: string }> = [];
    for (const [slug, source] of EXECUTOR_SOURCES) {
      const match = source.match(HARD_REQUIRE_PATTERN);
      if (match && !curated.has(slug)) {
        missing.push({
          slug,
          evidence: match[0],
          reason:
            "executor hard-requires Browserless (matched above) but is absent from " +
            "dependency-manifest.ts's browserless.capabilities — add it there, or the " +
            "credential and provider-health gates will not skip it when Browserless is " +
            "unconfigured/down, producing timeout noise instead of clean skips",
        });
      }
    }
    expect(missing, JSON.stringify(missing, null, 2)).toEqual([]);
  });

  // Pins today's audited set so an unreviewed addition/removal fails loudly
  // and has to be a deliberate diff, not a silent drift. Also proves the
  // list isn't empty (a curated list emptied out by accident fails this
  // exact-match assertion, so a separate non-empty check would be
  // redundant). Update this alongside dependency-manifest.ts's
  // browserless.capabilities with a reason in the commit message if the
  // set legitimately changes.
  it("matches the audited 2026-08-18 hard-require set exactly", () => {
    expect([...CURATED_BROWSERLESS_SLUGS].sort()).toEqual(
      [
        "annual-report-extract",
        "company-enrich",
        "estonian-company-data",
        "html-to-pdf",
        "landing-page-roast",
        "screenshot-url",
        "web-extract",
      ].sort(),
    );
  });
});
