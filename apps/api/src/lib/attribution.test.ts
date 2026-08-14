import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecute = vi.fn().mockResolvedValue([]);
vi.mock("../db/index.js", () => ({ getDb: () => ({ execute: mockExecute }) }));

import { extractClientMeta, recordDiscoveryHit, saltedIpHash } from "./attribution.js";

function reader(headers: Record<string, string>) {
  return { header: (n: string) => headers[n.toLowerCase()] };
}

beforeEach(() => {
  mockExecute.mockClear();
});

describe("extractClientMeta", () => {
  it("captures ua, referer, client header and src tag", () => {
    const meta = extractClientMeta(
      reader({ "user-agent": "x402-fetch/1.2", referer: "https://bazaar.example/x", "x-strale-client": "sdk-typescript/0.1.2" }),
      { src: "bazaar" },
    );
    expect(meta).toEqual({
      ua: "x402-fetch/1.2",
      referer: "https://bazaar.example/x",
      client_header: "sdk-typescript/0.1.2",
      src: "bazaar",
    });
  });

  it("returns undefined when no signal is present — callers skip the write", () => {
    expect(extractClientMeta(reader({}))).toBeUndefined();
  });

  it("clips oversized header values to 300 chars", () => {
    const meta = extractClientMeta(reader({ "user-agent": "a".repeat(1000) }));
    expect(meta?.ua).toHaveLength(300);
  });

  it("populates ip_day_hash (the load-bearing rollup join key) when ip is supplied", () => {
    const meta = extractClientMeta(reader({ "user-agent": "x" }), { ip: "1.2.3.4" });
    expect(meta?.ip_day_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(meta?.ip_day_hash).toBe(saltedIpHash("1.2.3.4"));
  });

  it("carries MCP clientInfo when supplied", () => {
    const meta = extractClientMeta(reader({}), { mcpClientInfo: { name: "claude-desktop", version: "1.0" } });
    expect(meta?.mcp_client_info).toEqual({ name: "claude-desktop", version: "1.0" });
  });
});

describe("saltedIpHash", () => {
  it("is stable within a UTC day and different across days (cross-day correlation impossible)", () => {
    const d1 = new Date("2026-08-13T01:00:00Z");
    const d1b = new Date("2026-08-13T23:00:00Z");
    const d2 = new Date("2026-08-14T01:00:00Z");
    expect(saltedIpHash("1.2.3.4", d1)).toBe(saltedIpHash("1.2.3.4", d1b));
    expect(saltedIpHash("1.2.3.4", d1)).not.toBe(saltedIpHash("1.2.3.4", d2));
  });

  it("digest depends on the secret, not just the day", () => {
    const d = new Date("2026-08-13T12:00:00Z");
    const h1 = saltedIpHash("1.2.3.4", d);
    const prev = process.env.AUDIT_HMAC_SECRET;
    process.env.AUDIT_HMAC_SECRET = "another-secret-that-is-32-chars-long!!";
    try {
      expect(saltedIpHash("1.2.3.4", d)).not.toBe(h1);
    } finally {
      process.env.AUDIT_HMAC_SECRET = prev;
    }
  });

  it("refuses to hash with a weak/missing salt instead of hashing weakly", () => {
    const prev = process.env.AUDIT_HMAC_SECRET;
    process.env.AUDIT_HMAC_SECRET = "short";
    try {
      expect(saltedIpHash("1.2.3.4")).toBeUndefined();
    } finally {
      process.env.AUDIT_HMAC_SECRET = prev;
    }
  });

  it("returns undefined for missing ip", () => {
    expect(saltedIpHash(undefined)).toBeUndefined();
  });

  it("never emits the raw IP", () => {
    const h = saltedIpHash("203.0.113.77")!;
    expect(h).not.toContain("203");
    expect(h).toHaveLength(16);
  });
});

describe("recordDiscoveryHit", () => {
  it("writes fire-and-forget and never throws when the insert fails", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db down"));
    expect(() => recordDiscoveryHit("/x402/catalog", reader({ "user-agent": "bot" }), { src: "bazaar" })).not.toThrow();
    // allow the rejected promise's catch to run
    await new Promise((r) => setImmediate(r));
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("passes no Date instances into the sql template (DEC-20260504-A shape)", () => {
    recordDiscoveryHit("/llms.txt", reader({ "user-agent": "bot" }), { ip: "1.2.3.4" });
    for (const call of mockExecute.mock.calls) {
      const walk = (v: unknown, seen = new Set<unknown>()): boolean => {
        if (v instanceof Date) return true;
        if (v === null || typeof v !== "object" || seen.has(v)) return false;
        seen.add(v);
        return Object.values(v as Record<string, unknown>).some((x) => walk(x, seen));
      };
      expect(walk(call)).toBe(false);
    }
  });
});
