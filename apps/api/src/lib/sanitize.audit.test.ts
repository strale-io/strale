/**
 * `audit_trail` carried a raw copy of the error that `error` served redacted.
 *
 * `GET /v1/transactions/:id` sanitises `row.error` and, until this change,
 * served `row.audit_trail` verbatim — so the same response handed the caller
 * the redacted string and the un-redacted one side by side. Measured read-only
 * against production: 120 rows carry `audit_trail.error_message`, and 15
 * distinct values across 51 rows differed from their sanitised form, leaking 14
 * hostnames, 2 full URLs, and vendor names the sanitiser exists to withhold.
 *
 * Same privacy boundary as PR #383, and strictly worse in one respect: #383's
 * leak needed a message carrying both a name-prefix and a network error code
 * and had never occurred. This one needed nothing.
 */

import { describe, it, expect } from "vitest";
import {
  redactAuditTrail,
  sanitizeFailureReason,
  AUDIT_ERROR_KEY_NAMES,
} from "./sanitize.js";

/** Every string anywhere in a structure, however nested. */
function allStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") acc.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, acc);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) allStrings(v, acc);
  return acc;
}

describe("redactAuditTrail — leaky material cannot escape", () => {
  it("strips a URL from error_message", () => {
    const out = redactAuditTrail({
      status: "failed",
      error_message: "GET https://internal.example.com/secret?token=abc failed",
    }) as Record<string, string>;
    expect(out.error_message).not.toContain("internal.example.com");
    expect(out.error_message).not.toContain("token=abc");
  });

  it("strips a bare hostname", () => {
    const out = redactAuditTrail({
      error_message: "Could not reach api.some-vendor.example",
    }) as Record<string, string>;
    expect(out.error_message).not.toContain("api.some-vendor.example");
    expect(out.error_message).toContain("[service]");
  });

  it("strips credentials embedded in a URL", () => {
    const out = redactAuditTrail({
      error_message: "https://user:hunter2@secrets.internal.net/a — EAI_AGAIN",
    }) as Record<string, string>;
    expect(out.error_message).not.toContain("hunter2");
    expect(out.error_message).not.toContain("secrets.internal.net");
  });

  it("strips a vendor name", () => {
    const out = redactAuditTrail({ error_message: "Browserless returned 429" }) as Record<
      string,
      string
    >;
    expect(out.error_message).not.toContain("Browserless");
  });

  it("reaches nested step errors, which solution audits carry", () => {
    const out = redactAuditTrail({
      steps: [
        { index: 0, capabilitySlug: "a", error: null },
        { index: 1, capabilitySlug: "b", error: "failed to reach api.some-vendor.example" },
      ],
    });
    const leaked = allStrings(out).filter((s) => s.includes("api.some-vendor.example"));
    expect(leaked).toEqual([]);
  });
});

describe("redactAuditTrail — leaves everything else exactly as it was", () => {
  it("does not turn a null error into the string 'Unknown error'", () => {
    // sanitizeFailureReason(null) is "Unknown error". Applying it to a null
    // audit field would fabricate a failure on a row that had none.
    const out = redactAuditTrail({ steps: [{ error: null }], error_message: null }) as Record<
      string,
      unknown
    >;
    expect(out.error_message).toBeNull();
    expect((out.steps as Array<{ error: unknown }>)[0].error).toBeNull();
  });

  it("leaves an empty string empty", () => {
    expect((redactAuditTrail({ error_message: "" }) as Record<string, string>).error_message).toBe(
      "",
    );
  });

  it("does not touch non-error fields that happen to contain a hostname", () => {
    // `data_source` legitimately names a vendor; redacting it would destroy
    // the provenance the audit body exists to carry.
    const body = {
      data_source: "Bolagsverket",
      shareable_url: "https://strale.dev/audit/abc",
      input_hash: "sha256:deadbeef",
      compliance: { access_endpoint: "GET /v1/transactions/x" },
    };
    expect(redactAuditTrail(body)).toEqual(body);
  });

  it("preserves structure, key order aside, for a body with nothing to redact", () => {
    const body = { a: 1, b: [1, 2, { c: true }], d: null, e: "plain" };
    expect(redactAuditTrail(body)).toEqual(body);
  });

  it("passes non-objects through", () => {
    expect(redactAuditTrail(null)).toBeNull();
    expect(redactAuditTrail(undefined)).toBeUndefined();
    expect(redactAuditTrail("x")).toBe("x");
    expect(redactAuditTrail(7)).toBe(7);
  });
});

describe("redactAuditTrail — stable under repetition", () => {
  const CASES: unknown[] = [
    { error_message: "GET https://internal.example.com/x — getaddrinfo ENOTFOUND upstream" },
    { error_message: "Browserless returned 429" },
    { error_message: "x".repeat(600) + " — ETIMEDOUT" },
    { steps: [{ error: "failed to reach api.some-vendor.example" }] },
    { error_message: "Reviews.io is a supported source" },
    { error_message: null },
    { error_message: "" },
  ];

  it.each(CASES)("redact(redact(x)) === redact(x) for %j", (body) => {
    const once = redactAuditTrail(body);
    expect(redactAuditTrail(once)).toEqual(once);
  });

  it("agrees with sanitizeFailureReason on the value it redacts", () => {
    // One authority, not two. If these ever disagree, a second sanitiser has
    // appeared somewhere.
    const raw = "GET https://internal.example.com/x failed";
    const viaAudit = (redactAuditTrail({ error_message: raw }) as Record<string, string>)
      .error_message;
    expect(viaAudit).toBe(sanitizeFailureReason(raw));
  });
});

describe("the key set covers what the audit builders actually emit", () => {
  it("names the error-bearing keys the builders write", () => {
    // `audit_trail` is free-form JSONB written by four builders, so there is
    // no type to lean on. If a builder starts emitting a differently-named
    // error field, redactAuditTrail will silently miss it — so the set is
    // pinned here and the integration test walks a real served body.
    expect([...AUDIT_ERROR_KEY_NAMES].sort()).toEqual(["error", "error_message"]);
  });
});
