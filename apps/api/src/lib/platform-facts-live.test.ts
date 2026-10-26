import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("./free-tier.js", () => ({ getFreeTierSlugs: vi.fn().mockResolvedValue(["servable-free-tool"]) }));
vi.mock("../db/index.js", () => ({ getDb: () => ({ execute }) }));
import { computePlatformFacts } from "./platform-facts.js";

describe("live catalogue pricing facts", () => {
  it("returns the database price floor and restricts its aggregate to visible active paid tools", async () => {
    execute.mockResolvedValueOnce([{ active_visible: 417, price_floor_cents: 7 }]).mockResolvedValueOnce([{ n: 63 }]);
    const facts = await computePlatformFacts();
    expect(facts.price_floor_cents).toBe(7);
    expect(facts.capability_counts.free_tier_slugs).toEqual(["servable-free-tool"]);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]).sql;
    expect(query).toMatch(/MIN\(price_cents\) FILTER \(WHERE lifecycle_state = 'active' AND visible = true AND is_free_tier = false AND price_cents > 0\)::int AS price_floor_cents/);
    execute.mockClear();
  });

  it("does not invent a price floor when the paid catalogue is empty", async () => {
    execute.mockResolvedValueOnce([{ price_floor_cents: null }]).mockResolvedValueOnce([{ n: 0 }]);
    expect((await computePlatformFacts()).price_floor_cents).toBeNull();
  });
});
