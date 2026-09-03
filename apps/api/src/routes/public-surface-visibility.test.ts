/**
 * Every public, unauthenticated capability surface must refuse a capability
 * the platform has made invisible.
 *
 * `visible = false` is how the platform withdraws something: the quality floor
 * quarantines with it, and a dark-launched capability starts that way. Both
 * routing paths in `lib/matching.ts` have always honoured it, so execution and
 * billing were never at risk. Two read surfaces did not:
 *
 *  - `GET /.well-known/agent-card.json`, the storefront an agent reads to
 *    decide what to buy, filtered only on `is_active` + `marketplace_eligible`.
 *    On 2026-09-03 it listed ten invisible capabilities by name, description
 *    and price to any anonymous caller, including `german-company-data`
 *    (suspended) and the two the quality floor had quarantined.
 *  - `GET /v1/capabilities/:slug` had the same gap, so a quarantined
 *    capability vanished from the list endpoint and still answered 200 with
 *    its full payload including input and output schemas.
 *  - `GET /llms-full.txt`, the machine-readable capability listing written for
 *    language models, had it too — found by an independent review AFTER the
 *    first two were fixed, still live, listing the same ten. Enumerating the
 *    readers is the discipline; fixing the two you thought of is not.
 *  - `GET /.well-known/mcp.json` counted withdrawn capabilities into the
 *    number it advertises.
 *  - `GET /v1/solutions` and its detail route disclosed them a third way, via
 *    the solutions that bundle them — found by a THIRD independent review,
 *    after two passes at the same enumeration. Eight active solutions had a
 *    withdrawn step; about twenty pointed at one through `extends_with`, a
 *    lookup that filtered nothing at all, not even `is_active`.
 *
 * These tests assert on the predicate the route actually sends to Postgres,
 * rendered through drizzle's own dialect, rather than on a stub's return
 * value. A stub that returns rows regardless of the filter cannot fail when
 * the filter is deleted, which is precisely the defect being fixed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

/** Predicates captured from `db.select().from().where(...)`, newest last. */
const captured: unknown[] = [];

/** Render a captured predicate to the SQL Postgres would receive. */
function rendered(clause: unknown): string {
  return new PgDialect().sqlToQuery(clause as never).sql;
}

/**
 * A chainable, thenable query stub. The list route awaits `where()` directly;
 * the detail route chains `.limit(1)` first. Both must work, and both must
 * record the predicate.
 */
function makeDbStub(rows: unknown[] = []) {
  const result = () => {
    const promise = Promise.resolve(rows);
    return {
      limit: () => Promise.resolve(rows),
      orderBy: () => Promise.resolve(rows),
      innerJoin: () => Promise.resolve(rows),
      leftJoin: () => Promise.resolve(rows),
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
    };
  };
  // A join's ON clause is a predicate too, and two of the surfaces below put
  // the visibility requirement there rather than in the WHERE — so the stub
  // has to capture both or the assertion passes vacuously.
  const chain = () => ({
    where: (clause: unknown) => {
      captured.push(clause);
      return result();
    },
    innerJoin: (_t: unknown, on: unknown) => {
      captured.push(on);
      return chain();
    },
    leftJoin: (_t: unknown, on: unknown) => {
      captured.push(on);
      return chain();
    },
    orderBy: () => Promise.resolve(rows),
    limit: () => Promise.resolve(rows),
  });
  return {
    select: () => ({ from: () => chain() }),
    execute: () => Promise.resolve([]),
  };
}

beforeEach(() => {
  captured.length = 0;
  vi.resetModules();
});

describe("GET /.well-known/agent-card.json", () => {
  it("asks Postgres for visible capabilities only", async () => {
    vi.doMock("../db/index.js", () => ({ getDb: () => makeDbStub([]) }));
    vi.doMock("../lib/platform-facts.js", () => ({
      computePlatformFacts: () => Promise.resolve({
        capability_counts: { active_visible: 0 },
        countries: { company_data_active: [] },
      }),
    }));
    const { buildAgentCard } = await import("./a2a.js");
    await buildAgentCard();

    expect(captured.length).toBeGreaterThan(0);
    const capabilityPredicate = rendered(captured[0]);
    // The columns the card has always filtered, so a vacuous render fails here
    // rather than passing the visible assertion by accident.
    expect(capabilityPredicate).toContain("is_active");
    expect(capabilityPredicate).toContain("marketplace_eligible");
    // The one it did not. This is the assertion that fails without the fix.
    expect(capabilityPredicate).toContain("visible");
  });
});

describe("GET /llms-full.txt", () => {
  it("asks Postgres for visible capabilities only", async () => {
    vi.doMock("../db/index.js", () => ({ getDb: () => makeDbStub([]) }));
    vi.doMock("../lib/platform-facts.js", () => ({
      computePlatformFacts: () => Promise.resolve({
        capability_counts: { active_visible: 0 },
        countries: { company_data_active: [] },
        free_tier_slugs: [],
      }),
    }));
    const { llmsTxtRoute } = await import("./llms-txt.js");
    await llmsTxtRoute.request("/llms-full.txt");

    const capabilityQuery = captured.map(rendered).find((p) => p.includes("marketplace_eligible"));
    expect(capabilityQuery, `no capability query captured: ${JSON.stringify(captured.map(rendered))}`).toBeDefined();
    expect(capabilityQuery).toContain("is_active");
    expect(capabilityQuery).toContain("visible");
  });
});

describe("GET /.well-known/mcp.json", () => {
  it("counts visible capabilities only", async () => {
    vi.doMock("../db/index.js", () => ({ getDb: () => makeDbStub([]) }));
    const { mcpServerCardRoute } = await import("./mcp-server-card.js");
    await mcpServerCardRoute.request("/");

    const capabilityQuery = captured.map(rendered).find((p) => p.includes("marketplace_eligible"));
    expect(capabilityQuery, `no capability query captured: ${JSON.stringify(captured.map(rendered))}`).toBeDefined();
    expect(capabilityQuery).toContain("visible");
  });
});

describe("GET /v1/solutions", () => {
  it("does not describe a step whose capability is withdrawn", async () => {
    // One solution must come back, or solIds is empty and the step query the
    // test is about never runs — a vacuous pass.
    vi.doMock("../db/index.js", () => ({
      getDb: () => makeDbStub([{ id: "s1", slug: "x", extendsWith: [] }]),
    }));
    const { solutionsRoute } = await import("./solutions.js");
    await solutionsRoute.request("/");

    const joinOn = captured.map(rendered).find((x) => x.includes("solution_steps"));
    expect(joinOn, `no step join captured: ${JSON.stringify(captured.map(rendered))}`).toBeDefined();
    expect(joinOn).toContain("visible");
  });
});

describe("GET /v1/solutions/:slug", () => {
  it("filters both the step join and the extends_with lookup", async () => {
    // extends_with had no filter at all — not even is_active — and returned
    // slug, name, description, price and category for whatever the column
    // named.
    vi.doMock("../db/index.js", () => ({
      getDb: () => makeDbStub([{ id: "s1", slug: "x", extendsWith: ["a-cap"] }]),
    }));
    const { solutionsRoute } = await import("./solutions.js");
    await solutionsRoute.request("/some-solution");

    const predicates = captured.map(rendered);
    const stepJoin = predicates.find((x) => x.includes("solution_steps"));
    expect(stepJoin, JSON.stringify(predicates)).toBeDefined();
    expect(stepJoin).toContain("visible");

    const extendsLookup = predicates.find((x) => x.includes("in") && x.includes("slug") && !x.includes("solution_steps"));
    expect(extendsLookup, `no extends_with lookup: ${JSON.stringify(predicates)}`).toBeDefined();
    expect(extendsLookup).toContain("visible");
    expect(extendsLookup).toContain("is_active");
  });
});

describe("GET /v1/capabilities/:slug", () => {
  it("asks Postgres for a visible capability only", async () => {
    vi.doMock("../db/index.js", () => ({ getDb: () => makeDbStub([]) }));
    const { capabilitiesRoute } = await import("./capabilities.js");
    const res = await capabilitiesRoute.request("/page-speed-test");

    // No row comes back from the stub, so the route 404s; the point of the
    // test is the predicate it sent, not the status.
    expect(res.status).toBe(404);
    expect(captured.length).toBeGreaterThan(0);
    const predicate = rendered(captured[captured.length - 1]);
    expect(predicate).toContain("slug");
    expect(predicate).toContain("is_active");
    expect(predicate).toContain("visible");
  });

  it("filters the detail view exactly as the list view does", async () => {
    // The two drifted apart, and the drift was invisible because each was
    // correct on its own terms. Whatever the list refuses, the detail refuses.
    vi.doMock("../db/index.js", () => ({ getDb: () => makeDbStub([]) }));
    const { capabilitiesRoute } = await import("./capabilities.js");
    await capabilitiesRoute.request("/");
    await capabilitiesRoute.request("/some-slug");
    expect(captured.length).toBe(2);

    const [list, detail] = captured.map(rendered);
    for (const column of ["is_active", "visible", "marketplace_eligible", "lifecycle_state"]) {
      expect(list, `list must filter ${column}`).toContain(column);
      expect(detail, `detail must filter ${column}`).toContain(column);
    }
  });
});
