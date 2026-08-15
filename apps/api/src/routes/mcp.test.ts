/**
 * Unit tests for the MCP funnel instrumentation (readiness P0, 2026-08-15).
 *
 * Only the two pure mapping functions are tested here — `classifyMcpRequest`
 * (pre-dispatch peek → discovery_hits endpoint label) and
 * `funnelEventEndpoint` (auth/payment rejection → endpoint label). Both are
 * deliberately pure (no request/DB access) so they're testable without
 * standing up the Hono app or a database.
 *
 * mcp.ts pre-warms the MCP tool catalog at module load
 * (`getCatalog().then(...)`), which would otherwise make importing this
 * file trigger real network calls. `strale-mcp/tools` and
 * `../lib/attribution.js` are mocked so the import is hermetic.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("strale-mcp/tools", () => ({
  fetchCapabilities: vi.fn().mockResolvedValue([]),
  fetchSolutions: vi.fn().mockResolvedValue([]),
  fetchTrustBatch: vi.fn().mockResolvedValue(new Map()),
  fetchSolutionTrust: vi.fn().mockResolvedValue(new Map()),
  registerStraleTools: vi.fn(),
}));

vi.mock("../lib/attribution.js", () => ({
  recordDiscoveryHit: vi.fn(),
}));

import { classifyMcpRequest, funnelEventEndpoint } from "./mcp.js";

describe("classifyMcpRequest", () => {
  it("classifies initialize, with clientInfo as a UA override", () => {
    const result = classifyMcpRequest({
      method: "initialize",
      params: { clientInfo: { name: "claude-desktop", version: "1.2.3" } },
    });
    expect(result).toEqual({ endpoint: "/mcp:initialize", uaOverride: "claude-desktop/1.2.3" });
  });

  it("classifies initialize with no clientInfo — no UA override", () => {
    const result = classifyMcpRequest({ method: "initialize" });
    expect(result).toEqual({ endpoint: "/mcp:initialize", uaOverride: undefined });
  });

  it("defaults clientInfo version to '?' when name is present but version is missing", () => {
    const result = classifyMcpRequest({
      method: "initialize",
      params: { clientInfo: { name: "cursor" } },
    });
    expect(result?.uaOverride).toBe("cursor/?");
  });

  it("classifies tools/list", () => {
    expect(classifyMcpRequest({ method: "tools/list" })).toEqual({ endpoint: "/mcp:tools/list" });
  });

  it("classifies tools/call with the tool name", () => {
    expect(classifyMcpRequest({ method: "tools/call", params: { name: "strale_execute" } })).toEqual({
      endpoint: "/mcp:tools/call:strale_execute",
    });
  });

  it("falls back to 'unknown' when tools/call has no name", () => {
    expect(classifyMcpRequest({ method: "tools/call" })).toEqual({
      endpoint: "/mcp:tools/call:unknown",
    });
  });

  it("sanitizes an oddly-charactered or oversized tool name", () => {
    const result = classifyMcpRequest({
      method: "tools/call",
      params: { name: "strale_execute; DROP TABLE transactions--".padEnd(200, "x") },
    });
    expect(result?.endpoint).toMatch(/^\/mcp:tools\/call:[a-zA-Z0-9_-]+$/);
    // 64-char cap on the sanitized token.
    const token = result!.endpoint.split(":").pop()!;
    expect(token.length).toBeLessThanOrEqual(64);
  });

  it("returns null for untracked methods (notifications, ping, resources/*)", () => {
    expect(classifyMcpRequest({ method: "notifications/initialized" })).toBeNull();
    expect(classifyMcpRequest({ method: "ping" })).toBeNull();
    expect(classifyMcpRequest({ method: "resources/list" })).toBeNull();
  });

  it("returns null for a null or method-less peek (peek failed / non-JSON body)", () => {
    expect(classifyMcpRequest(null)).toBeNull();
    expect(classifyMcpRequest({})).toBeNull();
  });
});

describe("funnelEventEndpoint", () => {
  it("encodes rejection type and tool name", () => {
    expect(funnelEventEndpoint({ type: "auth_rejected", tool: "strale_execute" })).toBe(
      "/mcp:reject:auth_rejected:strale_execute",
    );
    expect(funnelEventEndpoint({ type: "payment_rejected", tool: "strale_execute", slug: "vat-validate" })).toBe(
      "/mcp:reject:payment_rejected:strale_execute",
    );
    expect(funnelEventEndpoint({ type: "rate_limited", tool: "strale_execute" })).toBe(
      "/mcp:reject:rate_limited:strale_execute",
    );
  });

  it("sanitizes the tool name the same way classifyMcpRequest does", () => {
    const endpoint = funnelEventEndpoint({ type: "auth_rejected", tool: "weird tool/name" });
    expect(endpoint).toBe("/mcp:reject:auth_rejected:weirdtoolname");
  });
});
