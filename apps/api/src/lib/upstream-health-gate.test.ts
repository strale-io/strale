import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 2026-08-18: chromium-health.ts dead-import investigation ──────────────
//
// test-runner.ts imported isChromiumHealthy/isBrowserlessCapability/
// probeChromiumHealth from chromium-health.ts with zero call sites in that
// file. Investigation concluded findUnhealthyUpstream() (this module) was
// ALREADY the live mechanism performing that job in test-runner.ts's
// per-suite loop — so the fix was removing the dead imports, not wiring
// chromium-health.ts in a second time.
//
// That investigation also found the mapping this module (and, before this
// change, chromium-health.ts's isBrowserlessCapability() and
// event-triggers.ts's own copy) used to decide "which capabilities depend
// on Browserless" — capability_type='scraping' — was wrong in both
// directions against production data:
//   - under-inclusive: web-extract, annual-report-extract,
//     estonian-company-data, company-enrich hard-require Browserless (no
//     fallback) but are capability_type='ai_assisted'
//   - over-inclusive: most of the 41 capability_type='scraping' rows go
//     through a 3-tier fallback and keep working without Browserless
//
// getBrowserlessDependentSlugs() replaces that heuristic with
// dependency-manifest.ts's hand-curated `browserless.capabilities` list.
// These tests pin the new wiring and the skip-gate semantics that consume it.

const mockGetActiveProviders = vi.fn();
vi.mock("./dependency-manifest.js", () => ({
  getActiveProviders: (...args: unknown[]) => mockGetActiveProviders(...args),
}));

// Queue of rows returned by successive `.where()` calls against the
// capabilities table. Call order inside this module is fixed: first the
// browserless inArray/isActive query (from getBrowserlessDependentSlugs),
// then — only when invoked via refreshUpstreamMapping — the ai_assisted
// eq/isActive query.
let whereResultQueue: Array<Array<{ slug: string }>> = [];
const whereCalls: unknown[] = [];
const mockDb = {
  select: () => ({
    from: () => ({
      where: (condition: unknown) => {
        whereCalls.push(condition);
        return Promise.resolve(whereResultQueue.shift() ?? []);
      },
    }),
  }),
};
vi.mock("../db/index.js", () => ({ getDb: () => mockDb }));

import {
  getBrowserlessDependentSlugs,
  refreshUpstreamMapping,
  findUnhealthyUpstream,
  isUpstreamHealthy,
  updateUpstreamHealth,
  getCapabilityUpstreams,
} from "./upstream-health-gate.js";

function fakeBrowserlessProvider(capabilities: string[]) {
  return { name: "browserless", capabilities };
}

beforeEach(() => {
  mockGetActiveProviders.mockReset();
  whereResultQueue = [];
  whereCalls.length = 0;
  // Reset module-level health state that would otherwise leak across tests.
  updateUpstreamHealth("browserless", true);
});

describe("getBrowserlessDependentSlugs — manifest-driven, not capability_type", () => {
  it("queries the DB for exactly the candidate slugs from dependency-manifest.ts's browserless provider, filtered to isActive", async () => {
    mockGetActiveProviders.mockReturnValue([
      fakeBrowserlessProvider(["web-extract", "annual-report-extract", "screenshot-url"]),
      { name: "anthropic", capabilities: ["some-other-cap"] },
    ]);
    whereResultQueue = [[{ slug: "web-extract" }, { slug: "screenshot-url" }]]; // annual-report-extract inactive in DB

    const slugs = await getBrowserlessDependentSlugs();

    expect(slugs.sort()).toEqual(["screenshot-url", "web-extract"]);
    // Exactly one DB round-trip for this call.
    expect(whereCalls.length).toBe(1);
  });

  it("short-circuits with no DB call when the browserless provider has no curated capabilities", async () => {
    mockGetActiveProviders.mockReturnValue([fakeBrowserlessProvider([])]);

    const slugs = await getBrowserlessDependentSlugs();

    expect(slugs).toEqual([]);
    expect(whereCalls.length).toBe(0);
  });

  it("returns [] when no browserless provider is registered (retired/removed)", async () => {
    mockGetActiveProviders.mockReturnValue([{ name: "anthropic", capabilities: ["x"] }]);

    const slugs = await getBrowserlessDependentSlugs();

    expect(slugs).toEqual([]);
    expect(whereCalls.length).toBe(0);
  });
});

describe("refreshUpstreamMapping — wires browserless slugs, not capability_type='scraping' rows", () => {
  it("maps only the manifest-curated + active browserless slugs to the 'browserless' upstream", async () => {
    mockGetActiveProviders.mockReturnValue([
      fakeBrowserlessProvider(["web-extract", "company-enrich"]),
    ]);
    whereResultQueue = [
      [{ slug: "web-extract" }, { slug: "company-enrich" }], // browserless query
      [], // ai_assisted query — none in this test
    ];

    await refreshUpstreamMapping();

    expect(getCapabilityUpstreams("web-extract")).toEqual(["browserless"]);
    expect(getCapabilityUpstreams("company-enrich")).toEqual(["browserless"]);
    // A capability with capability_type='scraping' that ISN'T in the
    // curated manifest list (e.g. a fallback-tier capability like
    // url-to-markdown) must not be tagged as browserless-dependent by this
    // mapping — proving the old capability_type heuristic is gone.
    expect(getCapabilityUpstreams("url-to-markdown")).toEqual([]);
  });
});

describe("findUnhealthyUpstream — the skip gate test-runner.ts's per-suite loop calls", () => {
  beforeEach(async () => {
    mockGetActiveProviders.mockReturnValue([
      fakeBrowserlessProvider(["web-extract"]),
    ]);
    whereResultQueue = [[{ slug: "web-extract" }], []];
    await refreshUpstreamMapping();
  });

  it("Browserless down → returns 'browserless' for a browserless-dependent capability", () => {
    updateUpstreamHealth("browserless", false);
    expect(findUnhealthyUpstream("web-extract")).toBe("browserless");
  });

  it("Browserless up → returns null (runs normally)", () => {
    updateUpstreamHealth("browserless", true);
    expect(findUnhealthyUpstream("web-extract")).toBeNull();
  });

  it("dependency never probed yet → fails open (returns null, treated as healthy)", () => {
    // isUpstreamHealthy() defaults unknown dependency names to healthy via
    // `?? true` — this is the fail-open path for "no confirmed-bad signal
    // yet" (e.g. before the first health probe has completed after boot).
    expect(isUpstreamHealthy("browserless")).toBe(true); // seeded true in outer beforeEach
    updateUpstreamHealth("some-upstream-never-probed", false as unknown as boolean); // no-op sanity
    expect(findUnhealthyUpstream("web-extract")).toBeNull();
  });

  it("non-Browserless capability → never skipped by this gate regardless of Browserless health", () => {
    updateUpstreamHealth("browserless", false);
    // "some-other-capability" was never mapped to any upstream by
    // refreshUpstreamMapping() in this test's setup.
    expect(findUnhealthyUpstream("some-other-capability")).toBeNull();
  });
});
