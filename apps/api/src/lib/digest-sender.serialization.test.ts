import { afterEach, expect, it, vi } from "vitest";
import { Resend } from "resend";
import { preparePrivateDigestEmail, sendPrivateDigestEmail } from "./digest-sender.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("serializes the private reply address and idempotency through the real email SDK without network access", async () => {
  vi.stubEnv("RESEND_API_KEY", "test");
  vi.stubEnv("HEALTH_DIGEST_EMAIL", "owner@example.test");
  vi.stubEnv("HEALTH_MONITOR_INBOUND", "public-actions@example.test");
  const post = vi.spyOn(Resend.prototype, "post").mockResolvedValue({ data: { id: "synthetic" }, error: null, headers: null });
  const message = preparePrivateDigestEmail("private body", "private subject");
  vi.stubEnv("HEALTH_DIGEST_EMAIL", "changed@example.test");
  await sendPrivateDigestEmail(message, "summary-serialization-test");
  expect(post).toHaveBeenCalledWith("/emails", expect.objectContaining({
    from: message.from, to: "owner@example.test", reply_to: "owner@example.test", subject: "private subject", html: "private body",
  }), { idempotencyKey: "summary-serialization-test" });
  expect(JSON.stringify(post.mock.calls)).not.toContain("public-actions");
});
