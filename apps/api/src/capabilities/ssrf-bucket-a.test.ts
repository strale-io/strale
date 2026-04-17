/**
 * F-0-006 Bucket A regression test: direct-fetch capabilities that take
 * a user URL must refuse private IPs / cloud metadata / loopback. Every
 * slug in this list was migrated to safeFetch; a regression that drops
 * the migration gets caught here on the next test run.
 *
 * We exercise each capability via its registered executor. The input is
 * a URL that resolves to (or literally IS) a blocked IP. The executor
 * should reject with an error message mentioning "restricted" or
 * "scheme" — the specific wording comes from lib/url-validator.ts.
 */

import { describe, it, expect, beforeAll } from "vitest";

beforeAll(async () => {
  process.env.AUDIT_HMAC_SECRET =
    "unit-test-audit-secret-plenty-of-entropy-0123456789";
  process.env.ADMIN_SECRET =
    "unit-test-admin-secret-plenty-of-entropy-0123456789";
  // Some capabilities gate on env vars before fetching; set fakes so
  // the env guards pass and the SSRF check is what actually runs.
  process.env.ANTHROPIC_API_KEY ??= "sk-ant-test";
  process.env.BROWSERLESS_URL ??= "http://localhost:1";
  process.env.BROWSERLESS_API_KEY ??= "test-key";
  const { autoRegisterCapabilities } = await import("./auto-register.js");
  await autoRegisterCapabilities();
});

// Slugs that do a DIRECT `safeFetch(userUrl)` — Bucket A.
// Each must throw on literal-private-IP URL input.
//
// Not in the list (covered elsewhere, same safeFetch path):
//   api-health-check — product design swallows the throw and returns
//     `{is_healthy: false}`. Safe behaviour, hard to assert via `rejects`.
//     Covered by safe-fetch.test.ts's direct blocklist tests.
//   pdf-extract, invoice-extract, resume-parse, receipt-categorize,
//   image-resize — env-gated (they check ANTHROPIC_API_KEY etc. first).
//     safeFetch still fires, but asserting it through the env fence is
//     brittle. CI inventory guard proves the import is present.
const BUCKET_A = [
  "url-to-markdown",
  "url-health-check",
  "meta-extract",
  "link-extract",
  "og-image-check",
  "tech-stack-detect",
  "website-carbon-estimate",
  // domain-reputation: runs multiple partial checks and swallows per-check
  // errors so callers get a report even when one sub-check fails. Drop
  // from the parameterized test; safeFetch on the HTTPS check still
  // refuses private IPs, that branch just isn't visible via `rejects`.
];

describe.each(BUCKET_A)("F-0-006 Bucket A: %s refuses private IPs", (slug) => {
  async function getCap() {
    const { getExecutor } = await import("./index.js");
    const cap = getExecutor(slug);
    if (!cap) throw new Error(`no executor registered for ${slug}`);
    return cap;
  }

  // The input-shape varies: url / domain / pdf_url / image_url. We send
  // every plausible key with the same bad value; the executor takes
  // whichever one it recognises.
  const badInput = {
    url: "http://169.254.169.254/latest/meta-data/",
    domain: "169.254.169.254",
    pdf_url: "http://169.254.169.254/",
    image_url: "http://169.254.169.254/",
  };

  it("rejects cloud metadata IP as the initial URL", async () => {
    const cap = await getCap();
    await expect(cap(badInput)).rejects.toThrow(
      /restricted|scheme|invalid|refused/i,
    );
  });

  it("rejects an IPv4-mapped IPv6 loopback host", async () => {
    const cap = await getCap();
    const input = {
      url: "http://[::ffff:127.0.0.1]/",
      domain: "[::ffff:127.0.0.1]",
      pdf_url: "http://[::ffff:127.0.0.1]/",
      image_url: "http://[::ffff:127.0.0.1]/",
    };
    await expect(cap(input)).rejects.toThrow(
      /restricted|invalid|scheme/i,
    );
  });
});
