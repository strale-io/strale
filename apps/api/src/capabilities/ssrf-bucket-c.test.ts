/**
 * F-0-006 Bucket C regression test: capabilities that take a hostname for
 * DNS/TCP (not HTTP) must call validateHost. validateHost shares the
 * hardened isBlockedIp with validateUrl — same blocklist everywhere.
 */

import { describe, it, expect, beforeAll } from "vitest";

beforeAll(async () => {
  process.env.AUDIT_HMAC_SECRET =
    "unit-test-audit-secret-plenty-of-entropy-0123456789";
  process.env.ADMIN_SECRET =
    "unit-test-admin-secret-plenty-of-entropy-0123456789";
  const { autoRegisterCapabilities } = await import("./auto-register.js");
  await autoRegisterCapabilities();
});

// Slugs that open a raw TCP/DNS connection to the user hostname.
const BUCKET_C = [
  { slug: "port-check", input: { host: "127.0.0.1", port: 80 } },
  { slug: "ssl-check", input: { domain: "127.0.0.1" } },
  { slug: "ssl-certificate-chain", input: { host: "127.0.0.1" } },
];

describe.each(BUCKET_C)(
  "F-0-006 Bucket C: $slug refuses loopback host",
  ({ slug, input }) => {
    it("rejects 127.0.0.1", async () => {
      const { getExecutor } = await import("./index.js");
      const cap = getExecutor(slug);
      if (!cap) throw new Error(`no executor registered for ${slug}`);
      await expect(cap(input)).rejects.toThrow(/restricted|invalid/i);
    });
  },
);
