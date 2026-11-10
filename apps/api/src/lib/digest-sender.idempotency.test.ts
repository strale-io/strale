import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const provider = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = provider; } }));
vi.mock("./log.js", () => ({ log: { info: vi.fn() } }));
import { preparePrivateDigestEmail, sendPrivateDigestEmail, sendDigestEmail } from "./digest-sender.js";
describe("private digest provider boundary", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "test"); vi.stubEnv("HEALTH_DIGEST_EMAIL", "owner@example.test");
    vi.stubEnv("HEALTH_MONITOR_INBOUND", "public-actions@example.test");
    provider.send.mockReset(); provider.send.mockResolvedValue({ data: { id: "synthetic" }, error: null });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("freezes the full envelope, overrides public reply routing, and passes provider idempotency", async () => {
    const message = preparePrivateDigestEmail("private body", "private subject");
    vi.stubEnv("HEALTH_DIGEST_EMAIL", "changed@example.test"); vi.stubEnv("HEALTH_DIGEST_FROM", "changed-sender@example.test");
    vi.stubEnv("HEALTH_MONITOR_INBOUND", "another-public-workflow@example.test");
    await sendPrivateDigestEmail(message, "summary-test");
    const { reply_to, ...content } = message;
    expect(provider.send).toHaveBeenCalledWith({ ...content, replyTo: reply_to }, { idempotencyKey: "summary-test" });
    expect(message.to).toBe("owner@example.test"); expect(message.reply_to).toBe("owner@example.test");
    expect(message.from).not.toBe("changed-sender@example.test");
    expect(JSON.stringify(provider.send.mock.calls)).not.toContain("public-workflow");
  });
  it("never defaults a private recipient and never exposes a provider payload error", async () => {
    vi.stubEnv("HEALTH_DIGEST_EMAIL", ""); expect(() => preparePrivateDigestEmail("body", "subject")).toThrow("not configured");
    vi.stubEnv("HEALTH_DIGEST_EMAIL", "owner@example.test"); provider.send.mockResolvedValue({ error: { message: "sensitive provider details" } });
    await expect(sendPrivateDigestEmail(preparePrivateDigestEmail("body", "subject"), "summary-test")).rejects.toThrow("Private digest delivery failed");
  });
  it("preserves the health-action reply workflow for ordinary digests", async () => {
    await sendDigestEmail("body", "subject");
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({ reply_to: "public-actions@example.test" }));
  });
});
