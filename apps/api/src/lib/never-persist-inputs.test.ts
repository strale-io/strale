import { describe, expect, it } from "vitest";
import {
  NEVER_PERSIST_INPUTS,
  NOT_STORED_MARKER,
  inputForFingerprint,
  inputForPersistence,
} from "./never-persist-inputs.js";

describe("inputForPersistence", () => {
  it("lists password-strength's password", () => {
    expect(NEVER_PERSIST_INPUTS.get("password-strength")).toEqual(["password"]);
  });

  it("replaces the listed field with the marker and keeps the other fields", () => {
    const input = { password: "hunter2", note: "keep me" };
    const out = inputForPersistence("password-strength", input);
    expect(out).toEqual({ password: NOT_STORED_MARKER, note: "keep me" });
    expect(JSON.stringify(out)).not.toContain("hunter2");
  });

  it("never mutates the caller's object, so the executor still sees the real value", () => {
    const input = { password: "hunter2" };
    const out = inputForPersistence("password-strength", input);
    expect(input.password).toBe("hunter2");
    expect(out).not.toBe(input);
  });

  it("maps every password to the same persisted form, so a hash of it carries nothing", () => {
    expect(inputForPersistence("password-strength", { password: "a" })).toEqual(
      inputForPersistence("password-strength", { password: "correct horse battery staple" }),
    );
  });

  it("returns the SAME object for an unlisted slug (other capabilities byte-for-byte unchanged)", () => {
    const input = { password: "x", vat_number: "SE1" };
    expect(inputForPersistence("vat-validate", input)).toBe(input);
  });

  it("returns the same object when a listed slug's fields are absent", () => {
    const input = { other: 1 };
    expect(inputForPersistence("password-strength", input)).toBe(input);
  });

  it("does not add a listed field that was not sent", () => {
    expect(inputForPersistence("password-strength", { other: 1 })).not.toHaveProperty("password");
  });

  it("masks a present-but-empty or non-string value too", () => {
    expect(inputForPersistence("password-strength", { password: "" })).toEqual({ password: NOT_STORED_MARKER });
    expect(inputForPersistence("password-strength", { password: 12345 })).toEqual({ password: NOT_STORED_MARKER });
  });

  it("passes through null, undefined, arrays and a missing slug", () => {
    expect(inputForPersistence("password-strength", null)).toBeNull();
    expect(inputForPersistence("password-strength", undefined)).toBeUndefined();
    const arr = ["hunter2"];
    expect(inputForPersistence("password-strength", arr)).toBe(arr);
    const input = { password: "hunter2" };
    expect(inputForPersistence(null, input)).toBe(input);
    expect(inputForPersistence(undefined, input)).toBe(input);
  });
});

describe("caller-controlled slugs that name Object.prototype members", () => {
  // The slug reaches this module before matching (do.ts fingerprint) and from
  // a URL path (/v1/solutions/:slug/execute). A plain-object lookup would
  // return Object.prototype.constructor etc. and throw, turning a 404 into a 500.
  const PROTO_SLUGS = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "__defineGetter__"];
  for (const slug of PROTO_SLUGS) {
    it(`"${slug}" is treated as unlisted, not as a field list`, () => {
      const input = { password: "hunter2", value: 1 };
      expect(inputForPersistence(slug, input)).toBe(input);
      expect(inputForFingerprint(slug, input)).toBe(input);
    });
  }
});

describe("inputForFingerprint", () => {
  it("behaves like inputForPersistence when the slug is known", () => {
    const input = { password: "hunter2" };
    expect(inputForFingerprint("password-strength", input)).toEqual({ password: NOT_STORED_MARKER });
    expect(inputForFingerprint("vat-validate", input)).toBe(input);
  });

  it("masks every listed field when the slug is not yet known (task-routed request)", () => {
    const out = inputForFingerprint(null, { password: "hunter2", task_hint: "x" });
    expect(out).toEqual({ password: NOT_STORED_MARKER, task_hint: "x" });
  });

  it("returns the same object for a slug-less input with no listed fields", () => {
    const input = { vat_number: "SE1" };
    expect(inputForFingerprint(null, input)).toBe(input);
  });
});
