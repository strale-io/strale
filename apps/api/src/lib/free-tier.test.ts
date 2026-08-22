import { describe, expect, it, beforeEach } from "vitest";
import { getServableFreeTierCapabilities, getFreeTierSlugs, resetFreeTierCache } from "./free-tier.js";
import { isServableCapability } from "./x402-eligibility.js";

/**
 * The defect being pinned (2026-08-22): `do.ts` derived the free-tier
 * advertisement from `is_free_tier AND is_active AND lifecycle_state =
 * 'active'` and never consulted `visible`. When the quality floor quarantined
 * `url-to-markdown` (visible = false), `matchCapability` refused to serve it
 * while the 401 body kept listing it as free to try.
 *
 * Both directions are asserted, and the first test fails against the
 * un-fixed predicate: a quarantined free-tier row must not be advertised, and
 * a servable one must be.
 */

type Row = {
  slug: string;
  priceCents: number;
  description: string;
  isActive: boolean;
  visible: boolean;
  lifecycleState: string;
};

const ROWS: Row[] = [
  { slug: "email-validate", priceCents: 2, description: "Validate an email address", isActive: true, visible: true, lifecycleState: "active" },
  { slug: "dns-lookup", priceCents: 2, description: "DNS records for a domain", isActive: true, visible: true, lifecycleState: "active" },
  // Quarantined by the quality floor — is_active stays true, visible goes false.
  { slug: "url-to-markdown", priceCents: 5, description: "URL to markdown", isActive: true, visible: false, lifecycleState: "active" },
  // Pre-launch: never listed, must not be advertised either.
  { slug: "dark-launch-thing", priceCents: 2, description: "Not launched", isActive: true, visible: false, lifecycleState: "validating" },
  // Probation is servable — matchCapability admits it, so advertising it is correct.
  { slug: "probation-thing", priceCents: 2, description: "On probation", isActive: true, visible: true, lifecycleState: "probation" },
];

/**
 * Minimal stand-in for the drizzle chain the module uses. It deliberately
 * applies ONLY the SQL-level predicate the real query carries
 * (`is_free_tier AND is_active`) and hands everything else back, so the test
 * exercises the servability filter rather than a mock of it.
 */
function fakeDb(rows: Row[]) {
  return {
    select: () => ({
      from: () => ({
        where: async () => rows.filter((r) => r.isActive),
      }),
    }),
  } as unknown as Parameters<typeof getServableFreeTierCapabilities>[0];
}

describe("the free-tier advertisement is produced by the servability predicate", () => {
  beforeEach(() => resetFreeTierCache());

  it("does not advertise a quarantined free-tier capability", async () => {
    const slugs = await getFreeTierSlugs(fakeDb(ROWS));
    expect(slugs).not.toContain("url-to-markdown");
  });

  it("does not advertise a capability that was never listed", async () => {
    const slugs = await getFreeTierSlugs(fakeDb(ROWS));
    expect(slugs).not.toContain("dark-launch-thing");
  });

  it("advertises everything that is servable, probation included", async () => {
    const slugs = await getFreeTierSlugs(fakeDb(ROWS));
    expect(slugs).toEqual(["dns-lookup", "email-validate", "probation-thing"]);
  });

  it("agrees with isServableCapability row for row — no second definition", async () => {
    const slugs = await getFreeTierSlugs(fakeDb(ROWS));
    for (const row of ROWS) {
      expect(slugs.includes(row.slug)).toBe(isServableCapability(row));
    }
  });

  it("carries price and description through for the pricing surface", async () => {
    const rows = await getServableFreeTierCapabilities(fakeDb(ROWS));
    expect(rows.find((r) => r.slug === "email-validate")).toEqual({
      slug: "email-validate",
      priceCents: 2,
      description: "Validate an email address",
    });
  });

  it("re-lists a capability once it becomes visible again", async () => {
    const relisted = ROWS.map((r) =>
      r.slug === "url-to-markdown" ? { ...r, visible: true } : r,
    );
    resetFreeTierCache();
    expect(await getFreeTierSlugs(fakeDb(relisted))).toContain("url-to-markdown");
  });
});
