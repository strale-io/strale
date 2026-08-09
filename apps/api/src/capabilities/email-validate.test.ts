/**
 * Output-contract tests for `validateOneEmail`.
 *
 * `email-validate` is a live capability (437 calls / 90d, free-tier and
 * x402-enabled). It was refactored so `email-validate-bulk` could share its
 * rules rather than fork them — the shared function was lifted out of the
 * registered handler, and the handler now delegates to it.
 *
 * The risk that refactor carried was a silent change to the wire shape or to
 * the provenance branch, neither of which the smoke test would have caught
 * (it only asserts that `guaranteed` fields are non-null). These tests pin
 * both, so a future change to the shared function cannot quietly alter what
 * existing callers receive.
 *
 * Pre-refactor behaviour being pinned:
 *   - format failure  → exactly {valid, email, format_valid, reason},
 *                       provenance.source === "algorithmic"
 *   - everything else → domain/MX/disposable/role/free fields present,
 *                       provenance.source === "algorithmic+dns"
 * The two paths were separate `return` statements before; they are now one
 * function plus a ternary, which is exactly the kind of merge that can drift.
 */

import { describe, it, expect } from "vitest";
import { validateOneEmail } from "./email-validate.js";

describe("validateOneEmail — format-failure path", () => {
  it("returns only the four format-failure fields", async () => {
    const r = await validateOneEmail("not-an-email");
    expect(r.valid).toBe(false);
    expect(r.format_valid).toBe(false);
    expect(r.reason).toBe("Invalid email format.");
    // The early return must NOT include the DNS-derived fields — the
    // manifest annotates them `common` precisely because they are absent here.
    expect(r.domain).toBeUndefined();
    expect(r.has_mx_records).toBeUndefined();
    expect(r.mx_records).toBeUndefined();
    expect(Object.keys(r).sort()).toEqual(["email", "format_valid", "reason", "valid"]);
  });

  it("lowercases and trims the echoed address", async () => {
    const r = await validateOneEmail("  NOT-AN-EMAIL  ");
    expect(r.email).toBe("not-an-email");
  });

  it("rejects an over-length address even if otherwise well formed", async () => {
    const long = "a".repeat(250) + "@example.com";
    const r = await validateOneEmail(long);
    expect(r.format_valid).toBe(false);
  });
});

describe("validateOneEmail — full path", () => {
  it("returns the documented field set for a well-formed address", async () => {
    // mxOverride keeps this test hermetic — no DNS, no network.
    const r = await validateOneEmail("Jane.Doe@Example.com", {
      has_mx: true,
      mx_records: ["mx1.example.com"],
    });
    expect(r.email).toBe("jane.doe@example.com");
    expect(r.format_valid).toBe(true);
    expect(r.domain).toBe("example.com");
    expect(r.has_mx_records).toBe(true);
    expect(r.mx_records).toEqual(["mx1.example.com"]);
    expect(r.is_disposable).toBe(false);
    expect(r.is_role_address).toBe(false);
    expect(r.is_free_provider).toBe(false);
    expect(r.valid).toBe(true);
  });

  it("marks role addresses without making them invalid", async () => {
    const r = await validateOneEmail("sales@example.com", {
      has_mx: true,
      mx_records: ["mx1.example.com"],
    });
    expect(r.is_role_address).toBe(true);
    expect(r.valid).toBe(true);
  });

  it("treats a plus-tag on a role prefix as the same role", async () => {
    const r = await validateOneEmail("sales+eu@example.com", {
      has_mx: true,
      mx_records: ["mx1.example.com"],
    });
    expect(r.is_role_address).toBe(true);
  });

  it("flags free providers", async () => {
    const r = await validateOneEmail("someone@gmail.com", {
      has_mx: true,
      mx_records: ["mx1.google.com"],
    });
    expect(r.is_free_provider).toBe(true);
    expect(r.valid).toBe(true);
  });

  it("is invalid when the domain has no MX", async () => {
    const r = await validateOneEmail("person@example.com", { has_mx: false, mx_records: [] });
    expect(r.has_mx_records).toBe(false);
    expect(r.valid).toBe(false);
  });

  it("suggests a correction only when there is no MX", async () => {
    const typo = await validateOneEmail("person@gmial.com", { has_mx: false, mx_records: [] });
    expect(typo.did_you_mean).toBe("person@gmail.com");

    // Same near-miss domain, but it resolves — no suggestion, since the
    // address is deliverable and second-guessing it would be wrong.
    const resolves = await validateOneEmail("person@gmial.com", {
      has_mx: true,
      mx_records: ["mx.gmial.com"],
    });
    expect(resolves.did_you_mean).toBeUndefined();
  });

  it("omits did_you_mean entirely rather than emitting null", async () => {
    const r = await validateOneEmail("person@nowhere-xyz-abc.test", {
      has_mx: false,
      mx_records: [],
    });
    expect("did_you_mean" in r).toBe(false);
  });
});

describe("validateOneEmail — mxOverride", () => {
  it("uses the supplied MX result instead of resolving", async () => {
    // If the override were ignored this would hit real DNS for a domain that
    // does not resolve, and `valid` would come back false.
    const r = await validateOneEmail("person@definitely-not-a-real-domain-xyz123.invalid", {
      has_mx: true,
      mx_records: ["cached.mx"],
    });
    expect(r.valid).toBe(true);
    expect(r.mx_records).toEqual(["cached.mx"]);
  });
});
