/**
 * Regression tests for the 2026-08-14 LLM-refusal leak in extractCompanyName.
 *
 * The helper asks Claude for a bare company name and returned whatever came
 * back. When the model declined in prose instead — which it does for a vague
 * request — that sentence became the registry search query, and the caller saw
 * it quoted inside a second error:
 *
 *   No Canadian company found matching "I cannot extract a Canadian company
 *   name from this request. "Bank" is too generic and does not identify a
 *   specific Canadian company.".
 *
 * Observed live on canadian-company-data with input {"company_name": "Bank"}.
 * Eleven registry capabilities share this helper, so all eleven could emit it.
 *
 * It fails three ways at once: it reads as a malfunction, it discloses that an
 * LLM sits in the path, and it never tells the caller what to send instead.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

let replyWith = "";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async () => ({ content: [{ type: "text", text: replyWith }] }),
    };
  },
}));

beforeEach(() => {
  vi.resetModules();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("extractCompanyName refusal handling", () => {
  it("does not pass a prose refusal through as a company name", async () => {
    const { extractCompanyName } = await import("./browserless-extract.js");
    replyWith =
      'I cannot extract a Canadian company name from this request. "Bank" is too generic ' +
      "and does not identify a specific Canadian company.";

    await expect(extractCompanyName("Bank", "Canadian")).rejects.toThrow(
      /Could not identify a specific Canadian company name/,
    );
  });

  it("never leaks the model's wording into the error the caller sees", async () => {
    const { extractCompanyName } = await import("./browserless-extract.js");
    replyWith = "I cannot extract a Canadian company name from this request.";

    const err = await extractCompanyName("Bank", "Canadian").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toMatch(/I cannot/i);
    // and it must say what to do instead
    expect((err as Error).message).toMatch(/registration number/i);
  });

  it("honours the NONE sentinel", async () => {
    const { extractCompanyName } = await import("./browserless-extract.js");
    replyWith = "NONE";
    await expect(extractCompanyName("a company", "Swedish")).rejects.toThrow(
      /Could not identify a specific Swedish company name/,
    );
  });

  it("still returns an ordinary company name unchanged", async () => {
    const { extractCompanyName } = await import("./browserless-extract.js");
    replyWith = "Shopify Inc.";
    await expect(extractCompanyName("look up Shopify", "Canadian")).resolves.toBe("Shopify Inc.");
  });

  it("strips surrounding quotes, as before", async () => {
    const { extractCompanyName } = await import("./browserless-extract.js");
    replyWith = '"Royal Bank of Canada"';
    await expect(extractCompanyName("royal bank", "Canadian")).resolves.toBe(
      "Royal Bank of Canada",
    );
  });

  it("does not mistake a long legitimate name for a refusal", async () => {
    const { extractCompanyName } = await import("./browserless-extract.js");
    // Real registry names get long; the guard must not eat them.
    replyWith = "The Manufacturers Life Insurance Company of Canada Holdings Limited";
    await expect(extractCompanyName("manulife", "Canadian")).resolves.toBe(replyWith);
  });

  it("rejects an empty response", async () => {
    const { extractCompanyName } = await import("./browserless-extract.js");
    replyWith = "   ";
    await expect(extractCompanyName("something", "Danish")).rejects.toThrow(
      /Could not identify a specific Danish company name/,
    );
  });
});
