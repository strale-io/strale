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

import { describe, it, expect, beforeAll } from "vitest";
import { getExecutor } from "./index.js";

beforeAll(async () => {
  // Executors self-register on import.
  await import("./gitignore-generate.js");
  await import("./timezone-meeting-find.js");
  await import("./redirect-trace.js");
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
