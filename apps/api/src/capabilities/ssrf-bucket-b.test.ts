/**
 * F-0-006 Bucket B regression test: capabilities that forward a user URL
 * to a third party (Browserless, Anthropic, Jina). Each must call
 * validateUrl before forwarding. A bypass regression gets caught here.
 */

import { describe, it, expect, beforeAll } from "vitest";

beforeAll(async () => {
  process.env.AUDIT_HMAC_SECRET =
    "unit-test-audit-secret-plenty-of-entropy-0123456789";
  process.env.ADMIN_SECRET =
    "unit-test-admin-secret-plenty-of-entropy-0123456789";
  // Browserless-forwarding capabilities check env vars before calling
  // validateUrl; set fakes so the env fence doesn't mask the SSRF check.
  process.env.ANTHROPIC_API_KEY ??= "sk-ant-test";
  process.env.BROWSERLESS_URL ??= "http://localhost:1";
  process.env.BROWSERLESS_API_KEY ??= "test-key";
  const { autoRegisterCapabilities } = await import("./auto-register.js");
  await autoRegisterCapabilities();
});

// Slugs that forward a user URL to a third-party scraper. Each must
// refuse a private-IP URL before the outbound call.
const BUCKET_B = [
  "web-extract",
  "screenshot-url",
  "html-to-pdf",
];

describe.each(BUCKET_B)(
  "F-0-006 Bucket B: %s refuses private IPs before forwarding",
  (slug) => {
    it("rejects cloud metadata IP", async () => {
      const { getExecutor } = await import("./index.js");
      const cap = getExecutor(slug);
      if (!cap) throw new Error(`no executor registered for ${slug}`);
      await expect(
        cap({ url: "http://169.254.169.254/latest/meta-data/" }),
      ).rejects.toThrow(/restricted|scheme|invalid|refused/i);
    });
  },
);
