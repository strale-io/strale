import { describe, expect, it, vi } from "vitest";

vi.mock("./log.js", () => ({ log: { info: vi.fn() } }));

const { isPlaceholderBearer, placeholderBearerCount, readBearer } = await import("./bearer-placeholder.js");
const { log } = await import("./log.js");

describe("isPlaceholderBearer", () => {
  it.each([
    "",
    "   ",
    "${STRALE_API_KEY}",
    "${ STRALE_API_KEY }",
    "${env:STRALE_API_KEY}",
    "${input:strale-api-key}",
    "$STRALE_API_KEY",
    "{{STRALE_API_KEY}}",
    "{{ $env.STRALE_API_KEY }}",
    "%STRALE_API_KEY%",
    "<your-key>",
    "<STRALE_API_KEY>",
    "<your Strale API key>",
    "YOUR_API_KEY",
    "your-api-key",
    "YOUR_STRALE_API_KEY",
    "your_api_key_here",
    "STRALE_API_KEY",
    "undefined",
    "null",
  ])("reads %j as a placeholder", (token) => {
    expect(isPlaceholderBearer(token)).toBe(true);
  });

  it.each([
    // Real credential prefixes are never placeholders, whatever follows.
    "sk_live_abc123",
    "sk_live_${STRALE_API_KEY}",
    "sk_live_YOUR_API_KEY",
    "sk_live_",
    "sto_at_0123abcd",
    "sto_at_<token>",
    // Malformed keys stay malformed and are refused as before.
    "sk_test_abc123",
    "abc123",
    "Bearer sk_live_abc",
    "STRALE_API_KEY_2",
    "my_api_key",
    "${STRALE_API_KEY}x",
    "x${STRALE_API_KEY}",
    "<a><b>",
    "<>",
    "{{}}",
    "$1abc",
  ])("does not read %j as a placeholder", (token) => {
    expect(isPlaceholderBearer(token)).toBe(false);
  });
});

describe("readBearer", () => {
  it.each([
    [undefined, null],
    [null, null],
    ["", null],
    ["Basic dXNlcjpwYXNz", null],
    ["bearer sk_live_lowercase", null],
    ["Bearer ", null],
    ["Bearer ${STRALE_API_KEY}", null],
    ["Bearer <your-key>", null],
    ["Bearer YOUR_API_KEY", null],
    ["Bearer sk_live_abc", "sk_live_abc"],
    ["Bearer sto_at_abc", "sto_at_abc"],
    ["Bearer not-a-key", "not-a-key"],
  ])("reads %j as %j", (header, expected) => {
    expect(readBearer(header, "/v1/do")).toBe(expected);
  });

  it("counts every placeholder and logs a sample by route, without the header value", () => {
    vi.mocked(log.info).mockClear();
    const before = placeholderBearerCount();
    readBearer("Bearer sk_live_real", "/mcp");
    readBearer(undefined, "/mcp");
    expect(placeholderBearerCount()).toBe(before);
    for (let i = 0; i < 100; i++) readBearer("Bearer ${STRALE_API_KEY}", "/mcp");
    expect(placeholderBearerCount()).toBe(before + 100);
    // The first ever, then every 100th: 100 consecutive reads cross exactly
    // one multiple of 100, plus the first if this test made it.
    expect(vi.mocked(log.info)).toHaveBeenCalledTimes(before === 0 ? 2 : 1);
    const logged = JSON.stringify(vi.mocked(log.info).mock.calls);
    expect(logged).toContain("/mcp");
    expect(logged).not.toContain("STRALE_API_KEY");
  });
});
