/**
 * The agent card is Strale's storefront — its most-read machine surface
 * (~520 fetches/week, 5× the x402 discovery file). These tests pin the three
 * properties that made the 2026-08-15 rewrite necessary, so they cannot
 * quietly regress:
 *
 *   1. every paid skill states its price and how to pay it, in the text an
 *      agent reads AND in fields a parser can act on;
 *   2. internal test artifacts never reach the public card — a solution named
 *      `test-solution-delete-me` was live on it;
 *   3. proven sellers come first, because a shallow reader only sees the top.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isInternalArtifact } from "./a2a.js";

describe("internal artifacts never reach the storefront", () => {
  it("catches the artifact that was actually live on the card", () => {
    expect(isInternalArtifact("test-solution-delete-me")).toBe(true);
  });

  it("catches the scaffolding conventions", () => {
    expect(isInternalArtifact("zzz-no-such-cap")).toBe(true);
    expect(isInternalArtifact("anything-delete-me")).toBe(true);
    expect(isInternalArtifact("solution-test-solution-x")).toBe(true);
  });

  it("does not catch real services whose names merely contain 'test'", () => {
    // "test" as a word-fragment is not the marker; the marker is the naming
    // convention of our own scaffolding.
    expect(isInternalArtifact("page-speed-test")).toBe(false);
    expect(isInternalArtifact("webhook-test-payload")).toBe(false);
    expect(isInternalArtifact("test-case-generate")).toBe(false);
  });
});

describe("the card itself, built against a stubbed catalogue", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function buildStubbed() {
    // Stub the db module before importing the route module, so buildAgentCard
    // sees a small known catalogue instead of production.
    const capRows = [
      { slug: "google-search", name: "Google Search", description: "Search Google.",
        category: "web", priceCents: 5, isFreeTier: false,
        x402Enabled: true, lifecycleState: "active" },
      { slug: "email-validate", name: "Email Validation", description: "Validate email.",
        category: "validation", priceCents: 0, isFreeTier: true,
        x402Enabled: false, lifecycleState: "active" },
      { slug: "rare-lookup", name: "Rare Lookup", description: "Rarely bought.",
        category: "data", priceCents: 10, isFreeTier: false,
        x402Enabled: true, lifecycleState: "active" },
      // Real, sellable, on the card — but the gateway would not take money for
      // it. 66 rows looked like this in production on 2026-08-16.
      { slug: "api-key-only", name: "Key Only", description: "Paid, but not on x402.",
        category: "data", priceCents: 20, isFreeTier: false,
        x402Enabled: false, lifecycleState: "active" },
      { slug: "degraded-thing", name: "Degraded", description: "Quarantined service.",
        category: "data", priceCents: 20, isFreeTier: false,
        x402Enabled: true, lifecycleState: "quarantined" },
      { slug: "test-solution-delete-me", name: "Internal", description: "Scaffolding.",
        category: "internal", priceCents: 1, isFreeTier: false,
        x402Enabled: true, lifecycleState: "active" },
    ];
    const select = () => ({
      from: (table: unknown) => ({
        where: () => {
          // capabilities query carries isFreeTier in its selection; solutions does not
          return Promise.resolve(capRows);
        },
      }),
    });
    vi.doMock("../db/index.js", () => ({
      getDb: () => ({
        select,
        // externalRevenueBySlug: google-search sells, rare-lookup does not
        execute: () => Promise.resolve([{ slug: "google-search", cents: 3800 }]),
      }),
    }));
    vi.doMock("../lib/platform-facts.js", () => ({
      computePlatformFacts: () => Promise.resolve({
        capability_counts: { active_visible: 3 },
        countries: { company_data_active: ["se"] },
      }),
    }));
    const { buildAgentCard } = await import("./a2a.js");
    return (await buildAgentCard()).card as {
      payments?: { x402?: { catalog?: string } };
      skills: Array<{ id: string; description: string; price_cents?: number; x402_endpoint?: string }>;
    };
  }

  it("prices every paid skill in both text and structured fields", async () => {
    const card = await buildStubbed();
    const paid = card.skills.find((s) => s.id === "google-search")!;
    expect(paid.description).toContain("€0.05 per call");
    expect(paid.description).toContain("/x402/google-search");
    expect(paid.price_cents).toBe(5);
    expect(paid.x402_endpoint).toContain("/x402/google-search");
  });

  it("never advertises a payment endpoint the gateway would 404", async () => {
    // The card filtered on is_active + marketplace_eligible; the gateway
    // requires x402_enabled AND an active/probation lifecycle. 66 endpoints sat
    // in that gap in production — each 404'd, and each 404 wrote a false
    // `x402_unknown_slug` row into the demand table the same session added, so
    // the card was manufacturing build-signal out of its own bug.
    const card = await buildStubbed();
    for (const id of ["api-key-only", "degraded-thing"]) {
      const skill = card.skills.find((s) => s.id === id)!;
      expect(skill, `${id} should stay on the card`).toBeDefined();
      expect(skill.x402_endpoint, `${id} must not advertise x402`).toBeUndefined();
      expect(skill.description).not.toContain("/x402/");
      // Still sellable — it just needs an API key.
      expect(skill.description).toContain("per call");
    }
  });

  it("marks the free tier as free rather than pricing it at €0.00", async () => {
    const card = await buildStubbed();
    const free = card.skills.find((s) => s.id === "email-validate")!;
    expect(free.description).toContain("FREE");
    expect(free.price_cents).toBe(0);
    expect(free.x402_endpoint).toBeUndefined();
  });

  it("puts the proven seller above the never-bought skill", async () => {
    const card = await buildStubbed();
    const ids = card.skills.map((s) => s.id);
    expect(ids.indexOf("google-search")).toBeLessThan(ids.indexOf("rare-lookup"));
  });

  it("excludes the internal artifact even when the database returns it", async () => {
    const card = await buildStubbed();
    expect(card.skills.some((s) => s.id.includes("delete-me"))).toBe(false);
  });

  it("tells a payment-capable agent where the catalogue is", async () => {
    const card = await buildStubbed();
    expect(card.payments?.x402?.catalog).toContain("/x402/catalog");
  });
});
