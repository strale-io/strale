/**
 * WP0 §3 (CR-14 / N3) — public example output must be curated, never
 * customer-derived.
 *
 * GET /v1/internal/capabilities/:slug/example-output is exposed anonymously
 * through the /v1/public/ops allowlist and rendered on the public capability
 * detail page. It selects the newest passing row from `test_results`.
 *
 * The hazard: `recordPiggybackResult()` writes the verbatim output of real
 * customer /v1/do calls into `test_results` as `test_type = 'piggyback'` with
 * `passed = true`. Paid capabilities are not proactively tested, so for many of
 * them the freshest qualifying row was a customer's actual output — for a
 * compliance capability, personal data about a screened individual — published
 * as an "example" and labelled "real fixture data" by the frontend. Production
 * held 508 such rows at re-audit time.
 *
 * Discriminating property: pre-fix the query carried no test_type restriction,
 * so a piggyback row could be selected. This test asserts the restriction is
 * present in the SQL the handler actually builds at runtime, and that the
 * customer-derived type is not among the permitted ones.
 *
 * WP1's ephemeral-Postgres lane upgrades this to a data-level test (insert a
 * piggyback row, assert it is never returned). Until that lane exists, the
 * generated query is the strongest mechanizable artifact available.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const executed: unknown[] = [];

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: (query: unknown) => {
      executed.push(query);
      return Promise.resolve([]);
    },
  }),
}));

/** Rebuild the SQL text from a drizzle sql`` template object. */
function sqlTextOf(query: any): string {
  const chunks = query?.queryChunks ?? [];
  return chunks
    .map((chunk: any) => {
      if (typeof chunk === "string") return chunk;
      if (Array.isArray(chunk?.value)) return chunk.value.join("");
      return "";
    })
    .join(" ");
}

async function callExampleOutput(slug: string) {
  const { internalTestsRoute } = await import("./internal-tests.js");
  return internalTestsRoute.request(`/capabilities/${slug}/example-output`);
}

describe("GET /capabilities/:slug/example-output curation", () => {
  beforeEach(() => {
    executed.length = 0;
  });

  it("restricts the example source to authored fixture test types", async () => {
    // Distinct slug per test — the handler memoises responses by slug.
    await callExampleOutput("curation-probe-allowlist");
    expect(executed.length).toBeGreaterThan(0);

    const text = sqlTextOf(executed[0]);
    expect(text).toContain("test_type");
    expect(text).toContain("known_answer");
    expect(text).toContain("edge_case");
  });

  it("never sources a public example from customer traffic", async () => {
    await callExampleOutput("curation-probe-piggyback");
    const text = sqlTextOf(executed[0]);

    // The filter must be a positive allowlist. Asserting only "does not
    // contain 'piggyback'" would pass vacuously against the pre-fix query,
    // which had no test_type clause at all — so require the clause first.
    const allowlistAt = text.indexOf("test_type IN");
    expect(allowlistAt).toBeGreaterThan(-1);

    // 'piggyback' is customer-derived and must never be a permitted type.
    expect(text.slice(allowlistAt)).not.toContain("piggyback");
  });
});
