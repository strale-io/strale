/**
 * Regression test for the 2026-09-04 production crash class.
 *
 * Three capabilities answered a wrong-shaped input with a raw JavaScript
 * TypeError rather than a structured refusal:
 *
 *   gitignore-generate     "languages.map is not a function"          13 calls
 *   timezone-meeting-find  "timezones.map is not a function"          12 calls
 *   redirect-trace         "Cannot read properties of undefined ..."  12 calls
 *
 * Each reached the customer as an unstructured 500. A TypeError leaking out of
 * an executor is never correct: the manifest declares these fields, so a
 * wrong-shaped value is a refusal the platform owes an explanation for.
 *
 * These assertions fail against the un-applied fix (DEC-20260504-A step 2):
 * pre-fix each input throws, but with the TypeError message, so asserting on
 * the refusal text — and explicitly asserting the TypeError text is *gone* —
 * discriminates the two. Every case below is chosen to refuse before any
 * network call, so the test needs no fixtures and no upstream.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import { getExecutor } from "./index.js";

beforeAll(async () => {
  // Executors self-register on import.
  await import("./gitignore-generate.js");
  await import("./timezone-meeting-find.js");
  await import("./redirect-trace.js");
  await import("./classify-text.js");
  await import("./github-actions-generate.js");
  await import("./fake-data-generate.js");
});

/** Run an executor and return the error it threw, or fail loudly. */
async function refusalFrom(
  slug: string,
  input: Record<string, unknown>,
): Promise<Error> {
  const executor = getExecutor(slug);
  expect(executor, `${slug} is not registered`).toBeDefined();

  try {
    await executor!(input);
  } catch (err) {
    return err as Error;
  }
  throw new Error(`${slug} accepted a wrong-shaped input instead of refusing`);
}

describe("wrong-shaped input produces a refusal, not a TypeError", () => {
  it("gitignore-generate refuses a bare string for 'languages'", async () => {
    const err = await refusalFrom("gitignore-generate", {
      languages: "python",
    });

    expect(err.message).toMatch(/'languages' must be an array of strings/);
    // The pre-fix failure mode, pinned so it cannot come back.
    expect(err.message).not.toMatch(/is not a function/);
  });

  it("gitignore-generate refuses a non-string element", async () => {
    // Survives the outer Array.isArray check and used to die on .toLowerCase().
    const err = await refusalFrom("gitignore-generate", {
      languages: ["typescript", 7],
    });

    expect(err.message).toMatch(/item 1 is a number/);
    expect(err.message).not.toMatch(/toLowerCase is not a function/);
  });

  it("timezone-meeting-find refuses a bare string for 'timezones'", async () => {
    // "Europe/Stockholm".length is 16, so this cleared the `< 2` guard that
    // was supposed to be the input check.
    const err = await refusalFrom("timezone-meeting-find", {
      timezones: "Europe/Stockholm",
    });

    expect(err.message).toMatch(/'timezones' must be an array of strings/);
    expect(err.message).not.toMatch(/is not a function/);
  });

  it("timezone-meeting-find still enforces its own two-timezone minimum", async () => {
    // The shape guard must not have swallowed the real business rule.
    const err = await refusalFrom("timezone-meeting-find", {
      timezones: ["Europe/Stockholm"],
    });

    expect(err.message).toMatch(/at least 2 timezone names/);
  });

  it("redirect-trace refuses a non-numeric 'max_redirects'", async () => {
    // Number("abc") is NaN; `1 <= NaN` is false, so the trace loop never ran,
    // the chain stayed empty, and reading finalEntry.url threw.
    const err = await refusalFrom("redirect-trace", {
      url: "https://example.com",
      max_redirects: "abc",
    });

    expect(err.message).toMatch(/'max_redirects' must be a number/);
    expect(err.message).not.toMatch(/Cannot read properties of undefined/);
  });

  it("redirect-trace still refuses a missing url before touching the network", async () => {
    const err = await refusalFrom("redirect-trace", {});
    expect(err.message).toMatch(/'url' \(URL to trace\) is required/);
  });
});

/*
 * Found by independent review of the first pass, not by the production log.
 *
 * The original guard keyed on the `?? []` idiom, so it missed every instance
 * that defaulted differently — and two live capabilities carried the identical
 * crash while the guard stayed green. These pin the shapes that slipped
 * through, because the near-miss is the part most likely to come back.
 */
describe("shapes the first pass missed", () => {
  it("classify-text refuses a bare string for 'categories'", async () => {
    // No `??` clause at all, so `categories?.length` was 8 for "billing"
    // and `.join` threw.
    const err = await refusalFrom("classify-text", {
      text: "some text to classify",
      categories: "billing",
    });

    expect(err.message).toMatch(/'categories' must be an array of strings/);
    expect(err.message).not.toMatch(/join is not a function/);
  });

  it("github-actions-generate refuses a bare string for 'triggers'", async () => {
    // Defaulted to a non-empty literal rather than [], which is the only
    // reason the first guard did not see it.
    const err = await refusalFrom("github-actions-generate", {
      language: "typescript",
      triggers: "push",
    });

    expect(err.message).toMatch(/'triggers' must be an array of strings/);
    expect(err.message).not.toMatch(/join is not a function/);
  });

  it("github-actions-generate still applies its defaults when triggers is absent", async () => {
    // The fix must not turn "absent" into "refused" — absence still means
    // ["push", "pull_request"]. Reaching the LLM call proves the input was
    // accepted, and the missing-key error is where it stops.
    //
    // The key is stubbed empty rather than assumed absent: CI happens not to
    // set ANTHROPIC_API_KEY today, but a test whose safety rests on that would
    // start making real, billed Anthropic calls the day someone adds the
    // secret — silently, and on every run.
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    try {
      const err = await refusalFrom("github-actions-generate", {
        language: "typescript",
      });

      expect(err.message).not.toMatch(/'triggers'/);
      expect(err.message).toMatch(/ANTHROPIC_API_KEY/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("fake-data-generate refuses a bare string for 'fields'", async () => {
    // `(fields ?? []).map(...)` — the `??` never fired for a string, so .map threw.
    const err = await refusalFrom("fake-data-generate", { fields: "name" });

    expect(err.message).toMatch(/'fields' must be an array/);
    expect(err.message).not.toMatch(/map is not a function/);
  });
});
