/**
 * Ranking discovery surfaces by what agents actually buy.
 *
 * Context: as of 2026-08-15 a single anonymous wallet accounts for 98.7% of
 * revenue (€249 over 90 days) while 33 human signups produced €3.33. Finding a
 * second buyer on the paying rail is the whole growth problem, and every shelf
 * we publish was stocked in arbitrary order.
 */
import { describe, it, expect } from "vitest";
import { rankBySales } from "./seller-rank.js";

interface Item { slug: string; free?: boolean }
const slugOf = (i: Item) => i.slug;
const isFree = (i: Item) => i.free === true;

describe("ranking a catalogue by proven sales", () => {
  const catalogue: Item[] = [
    { slug: "exchange-rate" },              // what the shelf used to lead with
    { slug: "token-security-check" },
    { slug: "google-search" },              // €24.30/30d — a real seller
    { slug: "email-validate", free: true }, // 380 calls/30d
    { slug: "zebra-tool" },
  ];
  const revenue = new Map([["google-search", 2430], ["email-validate", 1140]]);

  it("puts the biggest earner first, not whatever the database returned first", () => {
    const ranked = rankBySales(catalogue, revenue, slugOf, isFree);
    expect(ranked[0].slug).toBe("google-search");
    expect(ranked[1].slug).toBe("email-validate");
  });

  it("ranks never-sold items below every seller", () => {
    const ranked = rankBySales(catalogue, revenue, slugOf, isFree).map(slugOf);
    expect(ranked.indexOf("exchange-rate")).toBeGreaterThan(ranked.indexOf("google-search"));
    expect(ranked.indexOf("token-security-check")).toBeGreaterThan(ranked.indexOf("email-validate"));
  });

  it("offers free items before paid ones among equally-unsold items", () => {
    // A free capability is an agent's cheapest way to try us at all.
    const items: Item[] = [{ slug: "b-paid" }, { slug: "a-free", free: true }];
    expect(rankBySales(items, new Map(), slugOf, isFree)[0].slug).toBe("a-free");
  });

  it("is deterministic when nothing has sold — alphabetical, not random", () => {
    const items: Item[] = [{ slug: "c" }, { slug: "a" }, { slug: "b" }];
    expect(rankBySales(items, new Map(), slugOf, isFree).map(slugOf)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the caller's array", () => {
    const items: Item[] = [{ slug: "z" }, { slug: "a" }];
    const before = items.map(slugOf);
    rankBySales(items, new Map(), slugOf, isFree);
    expect(items.map(slugOf)).toEqual(before);
  });

  it("falls back to alphabetical when the revenue map is empty", () => {
    // sellerRevenueBySlug returns an empty map on any query error, so this is
    // the production degraded path: a discovery surface must never 500 or
    // return nothing because a reporting query failed.
    const ranked = rankBySales(catalogue, new Map(), slugOf, isFree);
    expect(ranked).toHaveLength(catalogue.length);
    expect(ranked[0].slug).toBe("email-validate"); // free first, then alphabetical
  });
});
