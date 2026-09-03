/**
 * The withdrawal guard on `/v1/public/ops/*`.
 *
 * Four review rounds asked "does this query filter `visible`" across ~90 reads
 * of the `capabilities` table. The fourth round found four leaks no such grep
 * could reach — `/v1/public/ops/events`, `/onboarding/readiness`,
 * `/limitations/solutions/:slug`, `/tests/solutions/:slug` and
 * `/tests/capabilities/:slug/example-output` read `health_monitor_events`,
 * `test_suites`, `test_results` and `solution_steps`, tables that carry
 * `capability_slug` as a bare string and never join to `capabilities` at all.
 *
 * The lesson these tests encode: **guard the output, not the query.** A rule
 * about queries is bounded by the tables you thought to grep; a rule about
 * responses is bounded by the boundary itself, and survives a route added
 * later by someone who never read the history.
 *
 * Every shape below is one the reviewer pulled off production with curl.
 */
import { describe, it, expect } from "vitest";
import { pruneWithdrawn, requestNamesWithdrawn } from "./public-ops-visibility.js";

const withdrawn = new Set(["page-speed-test", "danish-company-data", "german-company-data"]);

describe("requestNamesWithdrawn", () => {
  it("catches a withdrawn slug in the path", () => {
    // GET /v1/public/ops/tests/capabilities/page-speed-test/example-output
    expect(
      requestNamesWithdrawn("/v1/public/ops/tests/capabilities/page-speed-test/example-output", {}, withdrawn),
    ).toBe(true);
    expect(
      requestNamesWithdrawn("/v1/public/ops/limitations/danish-company-data", {}, withdrawn),
    ).toBe(true);
  });

  it("catches a withdrawn slug in the query string", () => {
    // GET /v1/public/ops/events?capability_slug=page-speed-test
    expect(
      requestNamesWithdrawn("/v1/public/ops/events", { capability_slug: "page-speed-test" }, withdrawn),
    ).toBe(true);
  });

  it("leaves a visible capability alone", () => {
    expect(
      requestNamesWithdrawn("/v1/public/ops/tests/capabilities/email-validate/runs", {}, withdrawn),
    ).toBe(false);
    expect(
      requestNamesWithdrawn("/v1/public/ops/events", { capability_slug: "email-validate" }, withdrawn),
    ).toBe(false);
  });

  it("does not match a path segment that merely contains a withdrawn slug", () => {
    // Substring matching here would 404 unrelated capabilities.
    expect(
      requestNamesWithdrawn("/v1/public/ops/limitations/page-speed-test-v2", {}, withdrawn),
    ).toBe(false);
  });
});

describe("pruneWithdrawn", () => {
  it("drops the readiness enumeration's withdrawn entries", () => {
    // /onboarding/readiness returned all 340 slugs against 297 public ones.
    const body = {
      capabilities: [
        { slug: "email-validate", ready: true },
        { slug: "page-speed-test", ready: true },
        { slug: "danish-company-data", ready: true },
      ],
    };
    const out = pruneWithdrawn(body, withdrawn) as typeof body;
    expect(out.capabilities.map((c) => c.slug)).toEqual(["email-validate"]);
  });

  it("drops a withdrawn step from a solution's step list", () => {
    // /limitations/solutions/invoice-verify-de and /tests/solutions/:slug both
    // re-disclosed the exact step the solutions fix had just removed.
    const body = {
      solution_slug: "invoice-verify-de",
      steps: [
        { capability_slug: "vat-validate", limitations: [] },
        { capability_slug: "german-company-data", limitations: ["…"] },
      ],
    };
    const out = pruneWithdrawn(body, withdrawn) as typeof body;
    expect(out.steps.map((s) => s.capability_slug)).toEqual(["vat-validate"]);
  });

  it("drops withdrawn rows from the events feed", () => {
    const body = {
      events: [
        { event_type: "quality_floor", capability_slug: "page-speed-test", action_taken: "quarantined: 96% overall…" },
        { event_type: "quality_floor", capability_slug: "email-validate", action_taken: "promoted" },
      ],
    };
    const out = pruneWithdrawn(body, withdrawn) as typeof body;
    expect(out.events).toHaveLength(1);
    expect(out.events[0]!.capability_slug).toBe("email-validate");
  });

  it("reaches nested arrays, not just the top level", () => {
    const body = { groups: [{ name: "a", items: [{ slug: "page-speed-test" }, { slug: "ok-cap" }] }] };
    const out = pruneWithdrawn(body, withdrawn) as {
      groups: Array<{ items: Array<{ slug: string }> }>;
    };
    expect(out.groups[0]!.items.map((i) => i.slug)).toEqual(["ok-cap"]);
  });

  it("leaves a body with no capability slugs untouched", () => {
    const body = { summary: { total: 3, healthy: 2 }, generated_at: "2026-09-03T00:00:00Z" };
    expect(pruneWithdrawn(body, withdrawn)).toEqual(body);
  });

  it("does not mistake an unrelated string field for a slug", () => {
    const body = { events: [{ capability_slug: "email-validate", note: "page-speed-test was mentioned" }] };
    const out = pruneWithdrawn(body, withdrawn) as typeof body;
    expect(out.events).toHaveLength(1);
  });

  it("is a no-op when nothing is withdrawn", () => {
    const body = { capabilities: [{ slug: "page-speed-test" }] };
    expect(pruneWithdrawn(body, new Set())).toEqual(body);
  });
});
