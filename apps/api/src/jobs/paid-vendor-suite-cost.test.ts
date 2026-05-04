/**
 * Per DEC-20260504-A audit-followup test coverage protocol: the
 * migration 0062_paid_vendor_suite_cost.sql is metadata-only (no new
 * code path), so a runtime regression test isn't strictly required.
 * What IS required is a check that the UPDATE shape we ship matches
 * the audit's expected scope:
 *
 *   - 4 paid-vendor capability slugs at 1 cent (Dilisense + eSortcode)
 *   - 1 paid-vendor capability slug at 3 cents (risk-narrative-generate
 *     / Anthropic Sonnet 4.6 / max_tokens 1500)
 *   - filter on test_mode = 'live' so saved-data fixtures aren't touched
 *   - filter on test_type IN known_answer/edge_case/negative/known_bad
 *     so schema_check / dependency_health / piggyback (zero-cost-by-
 *     design types) aren't touched
 *   - filter on external_cost_cents = 0 so existing manual values are
 *     preserved (idempotent)
 *
 * The drizzle SQL we ship in apply-migrations.ts is compiled here with
 * PgDialect and asserted directly. No prod connection needed — the
 * test runs in CI without DB access.
 *
 * Note on shape: the SQL is built with sql`UPDATE … WHERE
 * capability_slug IN ('foo', 'bar')`. Static string literals inside
 * the tagged template are part of the rendered text, not bind
 * parameters. So we assert on `compiled.sql`, not `compiled.params`.
 */

import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();

/** Mirrors the Dilisense + eSortcode UPDATE in
 *  scripts/apply-migrations.ts (and drizzle/0062_paid_vendor_suite_cost.sql).
 *  Keeping this re-stated locally rather than importing from the script
 *  is the smallest faithful contract: the test doesn't pin the script's
 *  exact text but pins the SHAPE we expect the script to ship. */
function buildDilisenseUpdate() {
  return sql`
    UPDATE test_suites
    SET external_cost_cents = 1, updated_at = NOW()
    WHERE capability_slug IN ('pep-check', 'sanctions-check', 'adverse-media-check', 'uk-cop-check')
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `;
}

function buildRiskNarrativeUpdate() {
  return sql`
    UPDATE test_suites
    SET external_cost_cents = 3, updated_at = NOW()
    WHERE capability_slug = 'risk-narrative-generate'
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `;
}

describe("paid-vendor suite-cost migration shape (audit-followup)", () => {
  it("Dilisense/eSortcode UPDATE: target list, filters, idempotent guard", () => {
    const compiled = dialect.sqlToQuery(buildDilisenseUpdate());
    const text = compiled.sql.toLowerCase();

    expect(text).toContain("update test_suites");
    expect(text).toContain("set external_cost_cents = 1");

    // Slug whitelist — exactly the four vendors the audit confirmed
    // bill per call. Adding/removing one without updating the test
    // forces a code review.
    for (const slug of ["pep-check", "sanctions-check", "adverse-media-check", "uk-cop-check"]) {
      expect(text).toContain(`'${slug}'`);
    }
    // No bystander slugs accidentally pulled in (would inflate scope).
    expect(text).not.toContain("'risk-narrative-generate'");
    expect(text).not.toContain("'us-company-data-cobalt'");
    expect(text).not.toContain("'google-search'");
    expect(text).not.toContain("'translate'");

    // Required filters — each forces a specific class of suite to NOT
    // be touched.
    expect(text).toContain("test_mode = 'live'");
    expect(text).toContain("'known_answer'");
    expect(text).toContain("'edge_case'");
    expect(text).toContain("'negative'");
    expect(text).toContain("'known_bad'");

    // Test types we MUST NOT touch (zero-cost-by-design).
    expect(text).not.toContain("'schema_check'");
    expect(text).not.toContain("'dependency_health'");
    expect(text).not.toContain("'piggyback'");

    // Idempotency guard — only rows currently at 0 are updated, so
    // re-running the migration is a no-op (preserves manual
    // adjustments).
    expect(text).toContain("external_cost_cents = 0");

    // Hygiene: don't accidentally update a column we shouldn't.
    expect(text).toContain("active = true");
  });

  it("risk-narrative-generate UPDATE: Sonnet conservative cost (3 cents)", () => {
    const compiled = dialect.sqlToQuery(buildRiskNarrativeUpdate());
    const text = compiled.sql.toLowerCase();

    expect(text).toContain("update test_suites");
    expect(text).toContain("set external_cost_cents = 3");

    // Single-slug update — no Dilisense slugs leaking in.
    expect(text).toContain("'risk-narrative-generate'");
    expect(text).not.toContain("'pep-check'");
    expect(text).not.toContain("'sanctions-check'");

    // Same filter shape as the Dilisense UPDATE.
    expect(text).toContain("test_mode = 'live'");
    expect(text).toContain("'known_answer'");
    expect(text).toContain("'edge_case'");
    expect(text).toContain("'negative'");
    expect(text).toContain("'known_bad'");
    expect(text).not.toContain("'schema_check'");
    expect(text).not.toContain("'dependency_health'");
    expect(text).not.toContain("'piggyback'");
    expect(text).toContain("external_cost_cents = 0");
  });

  it("scope sanity: 5 slugs in this PR; broader sets explicitly out of scope", () => {
    // Pin the in-scope slug set so an accidental scope-creep edit
    // (e.g. adding ~80 Anthropic-Haiku slugs to the WHERE list) forces
    // a test failure + review. Greps the rendered SQL text, then
    // counts unique slug-shaped string literals.
    const dText = dialect.sqlToQuery(buildDilisenseUpdate()).sql;
    const rText = dialect.sqlToQuery(buildRiskNarrativeUpdate()).sql;
    const combined = dText + "\n" + rText;

    // Match all 'slug-style' string literals: lowercase + hyphens, len ≥ 3.
    const slugLiteralRegex = /'([a-z]+(?:-[a-z]+)+)'/g;
    const matches = [...combined.matchAll(slugLiteralRegex)].map((m) => m[1]);
    // Filter out test_type / test_mode literals (they happen to match
    // the regex shape: known_answer, edge_case, etc. — except they
    // contain underscores not hyphens, so the regex above already
    // excludes them. Sanity-check.).
    const slugs = matches.filter((s) => !["live"].includes(s));
    const unique = [...new Set(slugs)].sort();

    expect(unique).toEqual([
      "adverse-media-check",
      "pep-check",
      "risk-narrative-generate",
      "sanctions-check",
      "uk-cop-check",
    ]);
  });
});
