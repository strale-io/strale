/**
 * The 413 must survive the ROUTE, not just `extractInputs`.
 *
 * ## Why this file exists separately
 *
 * `x402-body-limit.test.ts` proves `extractInputs` rethrows a `BodyLimitError`
 * instead of falling through to query params. That is necessary and it is not
 * sufficient, and the difference was invisible until a mutation exposed it:
 * reverting BOTH route callers so they convert the rethrown error back into a
 * 400 left all 65 tests green.
 *
 * Both callers wrap the call:
 *
 *     try { inputs = await extractInputs(c, cap.inputSchema); }
 *     catch { return c.json({ error: "Invalid request body…" }, 400); }
 *
 * Hono's `bodyLimit` emits its 413 only when the error reaches `c.error`. A
 * handler that absorbs it defeats the middleware no matter what
 * `extractInputs` does — so the guard has to be asserted where the response is
 * actually produced.
 *
 * ## How the route is reached without a payment
 *
 * `extractInputs` runs after payment verification, so a normal capability is
 * unreachable in a unit test. The gateway skips verification entirely when
 * `x402PriceUsd === 0`, so the DB mock below returns a single zero-priced
 * capability. That is a real branch of the production code — and it is worth
 * noting that no capability is priced at 0 in production today, which is the
 * only reason the unverified path is not itself an exposure.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

const FREE_SLUG = "unit-test-free-capability";

/** One zero-priced capability, so `isFree` is true and verification is skipped. */
const capRow = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: FREE_SLUG,
  name: "Unit Test Free Capability",
  description: "Zero-priced so the gateway skips payment verification.",
  priceCents: 0,
  x402Method: "POST",
  inputSchema: { type: "object", properties: { base64: { type: "string" } } },
  outputSchema: null,
  transparencyTag: null,
  capabilityType: null,
  dataSource: null,
  dataClassification: null,
  processesPersonalData: false,
  personalDataCategories: [],
};

/**
 * Resolves to `[capRow]` for the capability query and `[]` for everything
 * else. The gateway's ensureCache() runs two selects; only the first needs a
 * row, and returning the row for both is harmless because the solution cache
 * keys on slug too.
 */
const result = (rows: unknown[]) => {
  const thenable: any = Promise.resolve(rows);
  for (const k of ["where", "limit", "orderBy", "innerJoin", "leftJoin", "from"]) {
    thenable[k] = () => result(rows);
  }
  return thenable;
};

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: () => Promise.resolve([]),
    select: () => result([capRow]),
  }),
}));

vi.mock("./mcp.js", () => {
  const { Hono } = require("hono");
  return { mcpRoute: new Hono() };
});

let app: any;

beforeAll(async () => {
  process.env.ADMIN_SECRET = "unit-test-admin-secret-plenty-of-entropy-0123456789";
  process.env.AUDIT_HMAC_SECRET = "unit-test-audit-secret-plenty-of-entropy-0123456789";
  ({ app } = await import("./../app.js"));
}, 120_000);

const X402_LIMIT = 8 * 1024 * 1024;

/** A body with no Content-Length, forcing bodyLimit's streaming branch. */
function oversizedStream(totalBytes = X402_LIMIT + 512 * 1024) {
  const chunk = new TextEncoder().encode("a".repeat(64 * 1024));
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (sent >= totalBytes) {
        ctrl.close();
        return;
      }
      ctrl.enqueue(chunk);
      sent += chunk.byteLength;
    },
  });
}

async function postStreamed(path: string) {
  return app.request(path, {
    method: "POST",
    body: oversizedStream(),
    headers: { "content-type": "application/json" },
    // @ts-expect-error -- Node requires duplex for a streaming request body
    duplex: "half",
  });
}

describe("an oversized streamed body keeps its 413 through the capability route", () => {
  it("reaches the route at all (the zero-price path is wired)", async () => {
    // Guard on the harness before asserting on it: a small body must NOT 404,
    // or every assertion below would be testing an unrouted path.
    const res = await app.request(`/x402/${FREE_SLUG}`, {
      method: "POST",
      body: JSON.stringify({ base64: "aaaa" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).not.toBe(404);
  });

  /**
   * NOT ASSERTED HERE, and the reason is recorded rather than hidden: with a
   * STREAMED body this route answers 404, not 413. The same path with a small
   * body resolves fine (the test above), so the capability is cached and the
   * route matches — the 404 appears only once `bodyLimit` replaces
   * `c.req.raw` with a re-wrapped Request, which is an artifact of driving a
   * duplex stream through `app.request` rather than a socket.
   *
   * The property still gets a behavioural proof: the solutions handler below
   * carries a byte-identical wrapper and IS reachable this way, so a mutation
   * that re-swallows the abort in both handlers fails there. Claiming this
   * route asserts it too would be claiming a proof that did not run.
   */

  it("is not the generic 'Invalid request body' 400", async () => {
    // The specific regression. Stated on its own because 400 was the actual
    // behaviour before the caller wrappers were fixed.
    const res = await postStreamed(`/x402/${FREE_SLUG}`);
    expect(res.status).not.toBe(400);
    expect(JSON.stringify(await res.json())).not.toMatch(/Expected JSON/i);
  });
});

describe("the solutions route has the same guard", () => {
  // Reviewer-found on the previous round: the solutions handler carries an
  // identical wrapper, and fixing only the capability handler would have left
  // half the rail converting 413 to 400.
  it("answers 413 for an oversized streamed body", async () => {
    const res = await postStreamed(`/x402/solutions/${FREE_SLUG}`);
    expect(res.status).toBe(413);
  });

  it("is not the generic 400 there either", async () => {
    const res = await postStreamed(`/x402/solutions/${FREE_SLUG}`);
    expect(res.status).not.toBe(400);
  });
});
