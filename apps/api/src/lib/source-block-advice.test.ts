import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { refusalDetails } from "./capability-refusal.js";
import { recoveryDetails } from "./errors.js";
import { sanitizeFailureReason } from "./sanitize.js";
import { asSourceBlocked, siteAccessRefusal, sourceBlockDetails, SourceBlockedError, type SiteBlock } from "./site-access.js";

// Promise-audit T1 follow-up 51. A source Strale chose that blocks Strale is
// answered execution_failed. The advice used to fall through to "retry with
// exponential backoff", but a block repeats on retry: only a rate limit, an
// explicit retry time or an unreadable robots.txt clears by waiting.
const url = "https://registry.example.org/entity/123";
const blocked = (block: SiteBlock) => asSourceBlocked(siteAccessRefusal(url, block), url);
/** The advice a caller sees: the message survives only as the sanitized string on every rail. */
const advice = (err: Error) => recoveryDetails("execution_failed", "The capability failed to execute.", { error: sanitizeFailureReason(err.message) });

describe("a source that blocks Strale is retryable only when waiting can clear the block", () => {
  for (const block of [
    { kind: "http", status: 401 }, { kind: "http", status: 403 }, { kind: "http", status: 407 },
    { kind: "challenge" }, { kind: "robots_disallow" },
  ] as SiteBlock[]) {
    it(`${JSON.stringify(block)} is not retryable and points to another tool`, () => {
      const details = advice(blocked(block));
      expect(details.retryable).toBe(false);
      expect(details.next_step).toMatch(/Choose another tool/);
      expect(sourceBlockDetails(blocked(block))).toMatchObject({ retryable: false });
    });
  }

  it("a 429 is retryable after a wait", () => {
    expect(advice(blocked({ kind: "http", status: 429 }))).toMatchObject({ retryable: true, retry_after_seconds: 60 });
    expect(sourceBlockDetails(blocked({ kind: "http", status: 429 }))).toMatchObject({ retryable: true, retry_after_seconds: 60 });
  });

  it("an unreadable robots.txt is retryable after 5 minutes", () => {
    for (const status of [0, 503]) {
      expect(advice(blocked({ kind: "robots_unavailable", status }))).toMatchObject({ retryable: true, retry_after_seconds: 300 });
    }
  });

  it("an explicit retry time in the message is honoured (NTA)", () => {
    for (const status of [403, 429]) {
      const err = new SourceBlockedError(
        `Source unavailable to Strale: NTA access restricted (status ${status}). Retry after 60 seconds.`,
        { kind: "http", status },
      );
      expect(advice(err)).toMatchObject({ retryable: true, retry_after_seconds: 60 });
    }
  });

  it("the thrown object gives the same advice on rails that never flatten it (x402, batch)", () => {
    // Those rails spread `refusalDetails(err) ?? sourceBlockDetails(err)`; a
    // source block is not a refusal, so the second half must carry the advice.
    const err = blocked({ kind: "http", status: 403 });
    expect(refusalDetails(err)).toBeUndefined();
    expect(refusalDetails(err) ?? sourceBlockDetails(err)).toMatchObject({ retryable: false });
    expect(sourceBlockDetails(blocked({ kind: "robots_unavailable", status: 0 }))).toMatchObject({ retryable: true, retry_after_seconds: 300 });
  });

  it("the x402 response carries the advice, and both object rails pass the thrown error to it", async () => {
    const { Hono } = await import("hono");
    const { schemaBadRequest } = await import("../routes/x402-gateway-v2.js");
    const app = new Hono();
    for (const status of [403, 429]) {
      const err = blocked({ kind: "http", status });
      app.get(`/${status}`, c => schemaBadRequest(c, sanitizeFailureReason(err.message), null, "execution_failed", refusalDetails(err) ?? sourceBlockDetails(err)));
    }
    expect((await (await app.request("/403")).json()).details).toMatchObject({ retryable: false, next_step: expect.stringMatching(/Choose another tool/) });
    expect((await (await app.request("/429")).json()).details).toMatchObject({ retryable: true, retry_after_seconds: 60 });
    // The rails themselves: a revert of either call site fails here.
    for (const file of ["../routes/x402-gateway-v2.ts", "./do/batch.ts"]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8"), file).toMatch(/refusalDetails\(err\) \?\? sourceBlockDetails\(err\)/);
    }
  });

  it("a package registry block reads as a source block on the string rails too", () => {
    const err = new SourceBlockedError(
      "Source unavailable to Strale: the package registry refused the request (HTTP 403). Strale does not bypass registry blocks.",
      { kind: "http", status: 403 },
    );
    expect(advice(err)).toMatchObject({ retryable: false });
    const source = readFileSync(new URL("../capabilities/package-docs.ts", import.meta.url), "utf8");
    expect(source).toContain("`Source unavailable to Strale: the package registry refused the request (HTTP ${response.status}).");
  });

  it("leaves every other failure's advice as it was", () => {
    expect(sourceBlockDetails("Upstream timeout after 10s")).toBeUndefined();
    expect(sourceBlockDetails(new Error("boom"))).toBeUndefined();
    expect(recoveryDetails("execution_failed", "", { error: "Upstream service unavailable" })).toMatchObject({ retryable: true });
  });
});
