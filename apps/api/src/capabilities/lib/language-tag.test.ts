/**
 * Tests for `resolveLanguageOrThrow`.
 *
 * `hl` has the same silent-ignore behaviour as `gl`: Google drops an
 * unrecognised value and bills the call anyway, so an unvalidated `language`
 * buys a search in the wrong language with no signal. Same failure class as
 * the 2026-08-09 `country: "墨西"` incident.
 *
 * These pin the deliberate asymmetry with the country resolver: this one
 * validates SHAPE, not membership, so it can never reject a real language it
 * has not heard of. The "knowingly accepted" case below documents the residue
 * that choice leaves behind — it is a trade, not an oversight.
 */

import { describe, it, expect } from "vitest";
import { resolveLanguageOrThrow } from "./language-tag.js";

describe("resolveLanguageOrThrow — accepts", () => {
  it("plain two-letter codes, normalising case", () => {
    expect(resolveLanguageOrThrow("en")).toBe("en");
    expect(resolveLanguageOrThrow("EN")).toBe("en");
    expect(resolveLanguageOrThrow("  sv  ")).toBe("sv");
  });

  it("three-letter primary subtags", () => {
    expect(resolveLanguageOrThrow("fil")).toBe("fil");
  });

  it("region and script subtags", () => {
    expect(resolveLanguageOrThrow("pt-BR")).toBe("pt-br");
    expect(resolveLanguageOrThrow("zh-CN")).toBe("zh-cn");
    expect(resolveLanguageOrThrow("zh-Hant")).toBe("zh-hant");
    expect(resolveLanguageOrThrow("zh-Hant-TW")).toBe("zh-hant-tw");
  });

  it("the fallback when nothing is supplied", () => {
    expect(resolveLanguageOrThrow("", { fallback: "en" })).toBe("en");
    expect(resolveLanguageOrThrow(undefined, { fallback: "en" })).toBe("en");
    expect(resolveLanguageOrThrow(null, { fallback: "en" })).toBe("en");
  });

  it("returns null when nothing is supplied and no fallback is given", () => {
    expect(resolveLanguageOrThrow(undefined)).toBeNull();
    expect(resolveLanguageOrThrow("   ")).toBeNull();
  });
});

describe("resolveLanguageOrThrow — rejects", () => {
  it("non-Latin script, the shape the incident actually took", () => {
    expect(() => resolveLanguageOrThrow("中文")).toThrow(/must be a two-letter ISO 639-1 code/);
    expect(() => resolveLanguageOrThrow("墨西")).toThrow(/must be a two-letter/);
  });

  it("full language names rather than codes", () => {
    expect(() => resolveLanguageOrThrow("English")).toThrow(/must be a two-letter/);
    expect(() => resolveLanguageOrThrow("Spanish")).toThrow(/must be a two-letter/);
  });

  it("an unresolvable value even when a fallback exists", () => {
    // The fallback covers "absent", not "present but wrong".
    expect(() => resolveLanguageOrThrow("中文", { fallback: "en" })).toThrow(/must be a two-letter/);
  });

  it("non-string types", () => {
    expect(() => resolveLanguageOrThrow(42)).toThrow(/must be a string/);
    expect(() => resolveLanguageOrThrow({ language: "en" })).toThrow(/must be a string/);
  });

  it("truncates an oversized value rather than reflecting it whole", () => {
    try {
      resolveLanguageOrThrow("x".repeat(5000));
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message.length).toBeLessThan(400);
      expect((e as Error).message).toContain("…");
    }
  });
});

describe("resolveLanguageOrThrow — knowingly accepted residue", () => {
  it("lets a well-formed but non-existent tag through", () => {
    // Documented trade: catching this would require a membership list, and an
    // incomplete membership list hard-rejects real languages. Google ignores
    // "xy" the same way it ignored "墨西" — but the shape check cannot tell
    // them apart, and rejecting real callers is the worse error.
    expect(resolveLanguageOrThrow("xy")).toBe("xy");
  });
});
