/**
 * Cross-capability regression test for country validation on the three
 * Serper-backed capabilities.
 *
 * Incident: on 2026-08-09 an x402 caller sent 50 consecutive `google-search`
 * calls with `country: "墨西"`. Serper silently ignores an unrecognised `gl`,
 * so every one of those calls was billed, ran unscoped, and echoed the bogus
 * country straight back — nothing in the response indicated the geo-scoping
 * had been dropped. `serp-analyze` and `keyword-rank-check` forwarded
 * `country` to the same parameter with the same silence.
 *
 * The load-bearing assertion here is not just that a bad country throws — it
 * is that it throws *without a fetch ever happening*. `fetch` is replaced with
 * a spy that fails the test if called, so a future refactor that moves the
 * validation below the network call is caught. That ordering is the whole
 * point: it is what makes the input rejection free rather than billed.
 *
 * Pinned per CLAUDE.md Test Infrastructure Principle B (input validation
 * before paid APIs).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getExecutor, type CapabilityInput } from "./index.js";

import "./google-search.js";
import "./serp-analyze.js";
import "./keyword-rank-check.js";

/** Minimum valid input per capability, before `country` is layered on. */
const CAPABILITIES: Array<{ slug: string; baseInput: CapabilityInput }> = [
  { slug: "google-search", baseInput: { query: "phone contact" } },
  { slug: "serp-analyze", baseInput: { keyword: "phone contact" } },
  {
    slug: "keyword-rank-check",
    baseInput: { domain: "example.com", keyword: "phone contact" },
  },
];

/** Values that must never reach a billed API call. */
const REJECTED = [
  "墨西", // the production incident value
  "墨西哥", // its untruncated form
  "XX",
  "ZZZ",
  "Korea", // ambiguous: North / South
  "not a country",
];

/** Values that must survive validation and proceed toward the upstream call. */
const ACCEPTED = ["mx", "MX", "MEX", "484", "Mexico", "uk", "SE"];

let fetchSpy: ReturnType<typeof vi.fn>;
let originalKey: string | undefined;

beforeEach(() => {
  fetchSpy = vi.fn(() => {
    throw new Error("fetch called — validation did not run before the paid call");
  });
  vi.stubGlobal("fetch", fetchSpy);

  // Present so the key check cannot be what stops an accepted value; the
  // fetch spy is what we want accepted values to reach.
  originalKey = process.env.SERPER_API_KEY;
  process.env.SERPER_API_KEY = "test-key-not-used";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.SERPER_API_KEY;
  else process.env.SERPER_API_KEY = originalKey;
});

describe.each(CAPABILITIES)("$slug — country validation", ({ slug, baseInput }) => {
  it.each(REJECTED)("rejects %j without spending a Serper call", async (country) => {
    const run = getExecutor(slug);
    expect(run, `${slug} is not registered`).toBeDefined();

    await expect(
      run!({ ...baseInput, country }, {} as never),
    ).rejects.toThrow(/must be an ISO 3166-1 alpha-2 code/);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(ACCEPTED)("lets %j through to the upstream call", async (country) => {
    const run = getExecutor(slug)!;

    // The spy throws, so the call rejects either way — what distinguishes a
    // pass is *which* error surfaces. An accepted country must get past
    // validation and die at the fetch boundary instead.
    await expect(
      run({ ...baseInput, country }, {} as never),
    ).rejects.toThrow(/fetch called/);

    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe("gl parameter", () => {
  it.each(CAPABILITIES)(
    "$slug sends lowercase alpha-2 regardless of the input form",
    async ({ slug, baseInput }) => {
      const run = getExecutor(slug)!;

      for (const country of ["MEX", "Mexico", "484", 484, "mx"]) {
        fetchSpy.mockClear();
        await run({ ...baseInput, country }, {} as never).catch(() => {});

        const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
        expect(body.gl, `input ${JSON.stringify(country)}`).toBe("mx");
      }
    },
  );

  it.each(CAPABILITIES)(
    "$slug translates the UK alias to gl=gb on the wire",
    async ({ slug, baseInput }) => {
      // The only accepted input whose wire value differs from what was sent —
      // worth asserting the transformation actually reaches Serper.
      const run = getExecutor(slug)!;
      await run({ ...baseInput, country: "uk" }, {} as never).catch(() => {});

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.gl).toBe("gb");
    },
  );

  it("google-search omits gl entirely when no country is given", async () => {
    const run = getExecutor("google-search")!;
    await run({ query: "phone contact" }, {} as never).catch(() => {});

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body).not.toHaveProperty("gl");
  });

  // Everything except google-search, which treats an omitted country as an
  // unscoped global search rather than defaulting to a market.
  it.each(CAPABILITIES.filter((c) => c.slug !== "google-search"))(
    "$slug defaults to gl=us when no country is given",
    async ({ slug, baseInput }) => {
      const run = getExecutor(slug)!;
      await run(baseInput, {} as never).catch(() => {});

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.gl).toBe("us");
    },
  );
});
