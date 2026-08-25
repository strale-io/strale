/**
 * The `/x402/*` rail must bound the request body, and must refuse cleanly.
 *
 * ## The gap
 *
 * VERIFY-DEP / WP13 follow-up, 2026-08-25. `app.ts` has applied a `bodyLimit`
 * to `/v1/*` (1 MiB), `/a2a` (256 KiB), `/mcp` (512 KiB) and `/webhooks/*`
 * (512 KiB) for months. `/x402/*` had none — it was simply never added — so
 * `x402-gateway-v2.ts`'s `extractInputs()` buffered whatever a caller sent
 * straight into `c.req.json()`.
 *
 * ## Why 8 MiB rather than copying /v1's 1 MiB
 *
 * Measured before choosing, because copying 1 MiB would have broken a
 * capability contract:
 *
 *   - Largest x402 request body ever observed in production: **2,658 bytes**,
 *     across 1,537 requests since 2026-08-15 (p50 41 B, p95 111 B, p99 289 B).
 *   - Largest input the platform intentionally supports: `image-to-text`
 *     declares `MAX_IMAGE_BYTES = 4 MiB` decoded — ~5.33 MiB of base64 on the
 *     wire before the JSON wrapper.
 *   - Seven x402 capabilities accept base64, four of them document extractors
 *     where multi-MiB PDFs are the normal case.
 *
 * 1 MiB is below what we already promise. 8 MiB is above it with room for the
 * wrapper, and still ~3,000x the largest request ever seen.
 *
 * ## The half a body cap alone would have missed
 *
 * Hono's `bodyLimit` has two branches and only one is a pre-flight rejection:
 *
 *   - **Content-Length present** → compared against the cap and rejected
 *     before the body is touched.
 *   - **No Content-Length (chunked)** → the body is wrapped in a counting
 *     stream that ERRORS once the cap is crossed, and that error becomes a 413
 *     only if it reaches `c.error`.
 *
 * `extractInputs()` wrapped `c.req.json()` in `try { … } catch { }` and fell
 * through to query params. Measured against a real HTTP socket before the fix,
 * an oversized chunked POST returned **`200 OK` with the body silently treated
 * as empty** — past payment verification, into input validation, with no
 * inputs. Memory was bounded; the answer was a lie.
 *
 * ## Why the boundary tests do not send eight megabytes
 *
 * Because the fix immediately above this one in the programme was a test that
 * became the workload it guarded against. Sending real 8 MiB bodies through
 * `app.request` timed out the suite at 10 s per case.
 *
 * Two branches, tested where each actually lives:
 *
 *   - The **pre-flight** branch reads `Content-Length` and never touches the
 *     body, so a declared length with a short body exercises exactly the code
 *     a real oversized request would hit — at no cost. Node's HTTP parser
 *     rejects a mismatched Content-Length with 400 before Hono sees it
 *     (verified over a real socket), so this shape is reachable only in-process.
 *   - The **streaming** branch is exercised on a purpose-built Hono app with a
 *     small cap, mirroring the middleware plus the gateway's swallowing
 *     handler. Reaching it through the real app needs a populated capability
 *     cache and therefore a database.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";

/**
 * The DB mock returns an EMPTY ARRAY from every terminal call, including a
 * bare `.where(...)`.
 *
 * The obvious mock — `where: () => ({ limit: … })` — makes `.where()` resolve
 * to an object rather than an array, so the x402 gateway's `ensureCache()`
 * threw `capRows is not iterable` on every request and retried. The tests
 * still passed, but each passing request cost about a second and three of them
 * intermittently blew vitest's 10 s default. A mock that makes the code under
 * test fail internally is not a neutral stand-in.
 */
const emptyResult = () => {
  const thenable: any = Promise.resolve([]);
  thenable.where = () => emptyResult();
  thenable.limit = () => emptyResult();
  thenable.orderBy = () => emptyResult();
  thenable.innerJoin = () => emptyResult();
  thenable.leftJoin = () => emptyResult();
  thenable.from = () => emptyResult();
  return thenable;
};

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: () => Promise.resolve([]),
    select: () => emptyResult(),
  }),
}));

vi.mock("./mcp.js", () => {
  const { Hono: H } = require("hono");
  return { mcpRoute: new H() };
});

beforeAll(() => {
  process.env.ADMIN_SECRET = "unit-test-admin-secret-plenty-of-entropy-0123456789";
  process.env.AUDIT_HMAC_SECRET = "unit-test-audit-secret-plenty-of-entropy-0123456789";
});

/**
 * Loaded ONCE. Each test previously called this, and while the module cache
 * makes the second import cheap, every request still drives app.ts's x402
 * cache refresh against the mocked (empty) DB. Under load that pushed three
 * of these past vitest's 10 s default and produced timeouts that looked like
 * failures of the limit rather than of the harness.
 */
let cachedApp: Awaited<ReturnType<typeof importApp>> | undefined;

async function importApp() {
  const { app } = await import("./../app.js");
  return app;
}

async function loadApp() {
  cachedApp ??= await importApp();
  return cachedApp;
}

/** The declared rail cap, restated so a change in app.ts must change this too. */
const X402_LIMIT = 8 * 1024 * 1024;

/**
 * A short body carrying a DECLARED Content-Length. Exercises bodyLimit's
 * pre-flight branch, which compares the header and returns without reading.
 */
function declaring(bytes: number) {
  return {
    method: "POST",
    body: JSON.stringify({ base64: "aaaa" }),
    headers: {
      "content-type": "application/json",
      "content-length": String(bytes),
    },
  };
}

describe("/x402/* enforces a request body cap", { timeout: 30_000 }, () => {
  it("refuses a body declared just OVER the limit", async () => {
    const app = await loadApp();
    const res = await app.request("/x402/image-resize", declaring(X402_LIMIT + 1));
    expect(res.status).toBe(413);
  });

  it("does NOT refuse a body declared just under the limit", async () => {
    // Not asserting 200: with no payment header and an empty catalog in this
    // DB-less harness the gateway answers 402 or 404. The point is that the
    // cap let it through to routing.
    const app = await loadApp();
    const res = await app.request("/x402/image-resize", declaring(X402_LIMIT - 1));
    expect(res.status).not.toBe(413);
  });

  it("is the x402 cap being applied, not some smaller inherited one", async () => {
    // 2 MiB is over /v1's 1 MiB and over /mcp's 512 KiB. If the x402 rail had
    // been given one of those numbers — or if this route were somehow covered
    // by the /v1 middleware — this would 413.
    const app = await loadApp();
    const res = await app.request("/x402/image-resize", declaring(2 * 1024 * 1024));
    expect(res.status).not.toBe(413);
  });

  it("refuses with the platform's error shape, not raw middleware text", async () => {
    const app = await loadApp();
    const res = await app.request("/x402/image-resize", declaring(X402_LIMIT + 1));
    const body = (await res.json()) as { error_code?: string; message?: string };
    expect(body.error_code).toBe("invalid_request");
    expect(body.message).toMatch(/too large/i);
  });

  it("refuses before the gateway does any x402 work", async () => {
    // A 413 body carries the fixed refusal and nothing else. Had the request
    // reached the gateway it would carry discovery fields — an `accepts` block
    // for a 402, or the catalog hint for an unknown slug.
    const app = await loadApp();
    const res = await app.request("/x402/image-resize", declaring(X402_LIMIT + 1));
    expect(JSON.stringify(await res.json())).not.toMatch(
      /accepts|x402Version|catalog|payment/i,
    );
  });
});

describe("the streaming branch refuses instead of reporting success", () => {
  const SMALL = 4 * 1024;

  /** The gateway's shape: bodyLimit, then a handler that swallows json() errors. */
  function appWith(handler: "swallow" | "rethrow") {
    const a = new Hono();
    a.onError((err, c) =>
      err instanceof HTTPException
        ? c.json({ status: err.status }, err.status)
        : c.json({ e: String((err as Error)?.message).slice(0, 60) }, 500),
    );
    a.use("/x/*", bodyLimit({ maxSize: SMALL }));
    a.post("/x/:slug", async (c) => {
      let inputs: unknown;
      try {
        inputs = await c.req.json();
      } catch (err) {
        if (handler === "rethrow" && (err as { name?: string })?.name === "BodyLimitError") {
          throw err;
        }
        inputs = c.req.query();
      }
      return c.json({ ok: true, keys: Object.keys((inputs ?? {}) as object) });
    });
    return a;
  }

  function oversizedStream() {
    const chunk = new TextEncoder().encode("a".repeat(1024));
    let sent = 0;
    return new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (sent >= SMALL * 2) {
          ctrl.close();
          return;
        }
        ctrl.enqueue(chunk);
        sent += chunk.byteLength;
      },
    });
  }

  async function post(a: Hono) {
    return a.request("http://local/x/image-resize", {
      method: "POST",
      body: oversizedStream(),
      headers: { "content-type": "application/json" },
      // @ts-expect-error -- Node requires duplex for a streaming request body
      duplex: "half",
    });
  }

  it("FAIL-BEFORE: swallowing the abort reports 200 on an oversized body", async () => {
    // The pre-fix gateway, reproduced. This is the defect, pinned so the fix
    // below is measured against something rather than asserted.
    const res = await post(appWith("swallow"));
    expect(res.status).toBe(200);
    expect((await res.json()).keys).toEqual([]); // body silently emptied
  });

  it("rethrowing the abort produces a 413", async () => {
    const res = await post(appWith("rethrow"));
    expect(res.status).toBe(413);
  });
});

describe("the gateway itself no longer swallows the abort", () => {
  /**
   * The property the fix actually changed, asserted on the real function
   * rather than on a reproduction of it.
   */
  function ctx(err: Error) {
    return {
      req: {
        method: "POST",
        header: () => "application/json",
        json: () => Promise.reject(err),
        query: () => ({ smuggled: "via-query" }),
      },
    };
  }

  it("rethrows a BodyLimitError instead of falling through to query params", async () => {
    const { extractInputs } = await import("./x402-gateway-v2.js");
    const err = Object.assign(new Error("Payload Too Large"), { name: "BodyLimitError" });
    await expect(extractInputs(ctx(err), null)).rejects.toThrow(/Payload Too Large/);
  });

  it("still falls through to query params for an ordinary parse failure", async () => {
    // The other direction. A malformed body is not an oversized body, and the
    // fallback that exists for GET-style callers has to keep working.
    const { extractInputs } = await import("./x402-gateway-v2.js");
    const err = new SyntaxError("Unexpected token < in JSON at position 0");
    await expect(extractInputs(ctx(err), null)).resolves.toEqual({ smuggled: "via-query" });
  });
});

describe("the other rails are untouched", { timeout: 30_000 }, () => {
  const cases: Array<{ path: string; limit: number; name: string }> = [
    { path: "/v1/do", limit: 1024 * 1024, name: "/v1" },
    { path: "/a2a", limit: 256 * 1024, name: "/a2a" },
    { path: "/mcp", limit: 512 * 1024, name: "/mcp" },
  ];

  for (const c of cases) {
    it(`${c.name} still refuses just over its own ${c.limit / 1024} KiB cap`, async () => {
      const app = await loadApp();
      expect((await app.request(c.path, declaring(c.limit + 1))).status).toBe(413);
    });

    it(`${c.name} still accepts just under its own cap`, async () => {
      const app = await loadApp();
      expect((await app.request(c.path, declaring(c.limit - 1))).status).not.toBe(413);
    });

    it(`${c.name} did NOT inherit the larger x402 cap`, async () => {
      // The failure mode if the new middleware were registered too broadly: a
      // body legal on x402 but illegal here would start being accepted.
      const app = await loadApp();
      expect((await app.request(c.path, declaring(4 * 1024 * 1024))).status).toBe(413);
    });
  }
});
