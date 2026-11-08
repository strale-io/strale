import { beforeEach, describe, expect, it, vi } from "vitest";

const { messagesCreate, safeFetchMock } = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
  safeFetchMock: vi.fn(),
}));

vi.mock("../lib/anthropic-client.js", () => ({
  createAnthropicClient: () => ({ messages: { create: messagesCreate } }),
}));
vi.mock("../lib/safe-fetch.js", () => ({ safeFetch: safeFetchMock }));

import { getExecutor } from "./index.js";
import "./image-to-text.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { classifyTransactionFailure } from "../lib/transaction-failure-taxonomy.js";
import { MAX_DECODED_IMAGE_BYTES } from "../lib/resource-limits.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const GIF = Buffer.from("GIF89a", "ascii");
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

const run = (input: Record<string, unknown>) => getExecutor("image-to-text")!(input);
const sentMediaType = () => messagesCreate.mock.calls[0][0].messages[0].content[0].source.media_type;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "offline-test-key";
  messagesCreate.mockReset().mockResolvedValue({
    content: [{ type: "text", text: '{"text":"ok","confidence":"high","language_detected":"en","text_type":"printed"}' }],
    stop_reason: "end_turn",
  });
  safeFetchMock.mockReset();
});

describe("image-to-text byte media detection", () => {
  it.each([
    ["raw JPEG", JPEG.toString("base64"), "image/jpeg"],
    ["jpg data header", `data:image/jpg;base64,${JPEG.toString("base64")}`, "image/jpeg"],
    ["disagreeing PNG header", `data:image/png;base64,${GIF.toString("base64")}`, "image/gif"],
    ["WebP", WEBP.toString("base64"), "image/webp"],
  ])("sends %s bytes with media_type %s", async (_name, base64, expected) => {
    await run({ base64 });
    expect(sentMediaType()).toBe(expected);
  });

  it.each([
    ["PDF", Buffer.from("%PDF-1.7").toString("base64")],
    ["SVG", Buffer.from("<svg></svg>").toString("base64")],
    ["random bytes", Buffer.from([1, 2, 3, 4]).toString("base64")],
    ["invalid base64", "not!base64"],
  ])("refuses %s base64 in every health consumer before Anthropic", async (_name, base64) => {
    const err = await run({ base64 }).catch((error: unknown) => error) as Error;
    expect(err.message).toBe("'base64' must be a PNG, JPEG, GIF or WebP image.");
    expect(isCapabilityRefusal(err)).toBe(true);
    expect(isUserInputError(err.message)).toBe(true);
    expect(classifyTransactionFailure(err.message)).toBe("caller_input");
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("uses JPEG bytes over a URL response's PNG content-type", async () => {
    safeFetchMock.mockResolvedValue(new Response(JPEG, { headers: { "content-type": "image/png" } }));
    await run({ image_url: "https://example.test/image" });
    expect(sentMediaType()).toBe("image/jpeg");
  });

  it("refuses HTML bytes labelled as an image before Anthropic", async () => {
    safeFetchMock.mockResolvedValue(new Response("<html></html>", { headers: { "content-type": "image/png" } }));
    const err = await run({ image_url: "https://example.test/image" }).catch((error: unknown) => error) as Error;
    expect(err.message).toBe("'image_url' must be a PNG, JPEG, GIF or WebP image.");
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("keeps the decoded size cap ahead of Anthropic", async () => {
    const oversized = Buffer.concat([PNG, Buffer.alloc(MAX_DECODED_IMAGE_BYTES)]).toString("base64");
    await expect(run({ base64: oversized })).rejects.toThrow("4.0MB or less");
    expect(messagesCreate).not.toHaveBeenCalled();
  });
});
