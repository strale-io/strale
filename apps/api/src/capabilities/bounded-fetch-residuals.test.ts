/**
 * #426 — the remaining response-buffering sites must be byte-bounded.
 *
 * #412 bounded the six x402 document/image capabilities; these are the seven
 * sites it recorded as residuals. Three fetch a DIRECT caller URL
 * (base64-encode-url, c2pa-inspect, website-carbon-estimate), one fetches a
 * link scraped out of third-party HTML with — before this change — a raw,
 * SSRF-unvalidated fetch() (annual-report-extract), and three buffer
 * Browserless render output whose size is caller-shaped (html-to-pdf,
 * screenshot-url, landing-page-roast).
 *
 * What these tests prove, per site:
 *   1. bodies are STREAM-bounded — below/exact limit accepted, +1 refused,
 *      declared over-limit refused before a single chunk is pulled AND the
 *      unconsumed body is cancelled, an understated content-length is caught
 *      by the actual byte counter;
 *   2. website-carbon-estimate now COUNTS instead of buffering, and still
 *      accepts pages far beyond the 4/8 MiB input caps — heavy pages are the
 *      product, so a mechanical cap would have broken it;
 *   3. annual-report-extract's scraped-link fetch goes through safeFetch, and
 *      an oversized filing degrades to the page-text strategy instead of
 *      being buffered unbounded;
 *   4. refusals classify caller_input (floor-exempt); vendor HTTP failures
 *      do not get rebadged;
 *   5. structurally, none of the seven can regress to arrayBuffer() or raw
 *      fetch() without failing this file.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { messagesCreate, c2paRead } = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
  c2paRead: vi.fn(),
}));
const safeFetchMock = vi.fn();
const browserlessFetchMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

vi.mock("../lib/safe-fetch.js", () => ({
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));

vi.mock("../lib/metered-vendor-fetch.js", () => ({
  browserlessFetch: (...args: unknown[]) => browserlessFetchMock(...args),
  meteredVendorFetch: (...args: unknown[]) => browserlessFetchMock(...args),
  vendorReachabilityFetch: (...args: unknown[]) => browserlessFetchMock(...args),
}));

// validateUrl resolves DNS for real; its SSRF behaviour is covered by its own
// suite. Everything else in the module stays real.
vi.mock("../lib/url-validator.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  validateUrl: async () => {},
}));

// c2pa-node is a native binding that may not load on every platform; the
// parse step is not under test here — the byte gate in front of it is.
vi.mock("c2pa-node", () => ({
  createC2pa: () => ({ read: c2paRead }),
}));

// landing-page-roast's rendered-HTML leg and the Browserless config reads.
vi.mock("./lib/browserless-extract.js", () => ({
  fetchRenderedHtml: async () => "<html><body>Landing page</body></html>",
  htmlToText: () => "Landing page text",
  getBrowserlessConfig: () => ({ url: "https://browserless.example", key: "test-key" }),
}));

import { getDirectExecutor } from "./index.js";
import "./base64-encode-url.js";
import "./c2pa-inspect.js";
import "./website-carbon-estimate.js";
import "./annual-report-extract.js";
import "./html-to-pdf.js";
import "./screenshot-url.js";
import "./landing-page-roast.js";
import {
  MAX_DECODED_IMAGE_BYTES,
  MAX_DECODED_DOCUMENT_BYTES,
  MAX_RENDERED_SCREENSHOT_BYTES,
  MAX_RENDERED_PDF_BYTES,
  MAX_MEASURED_TRANSFER_BYTES,
  checkedBase64,
  countBodyBytes,
  normalizeBase64,
  ImageLimitError,
} from "./lib/image-limits.js";
import {
  classifyTransactionFailure,
  countsAgainstCapability,
} from "../lib/transaction-failure-taxonomy.js";
import { streamingResponse } from "./lib/streaming-response-testutil.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CHUNK = 64 * 1024;

const run = (slug: string) => getDirectExecutor(slug)!;

beforeEach(() => {
  messagesCreate.mockReset();
  c2paRead.mockReset();
  safeFetchMock.mockReset();
  browserlessFetchMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.BROWSERLESS_URL = "https://browserless.example";
  process.env.BROWSERLESS_API_KEY = "test-key";
});

/**
 * The byte-boundary contract every bounded site must satisfy. `bigOk` is a
 * deliberately large accepted size (well past the old 4/8 MiB input caps for
 * the render paths) proving the chosen limit is not accidentally tiny.
 */
interface SiteSpec {
  slug: string;
  limit: number;
  bigOk: number;
  refusal: RegExp;
  fetchMock: () => ReturnType<typeof vi.fn>;
  contentType?: string;
  invoke: () => Promise<{ output: Record<string, unknown> }>;
  arrange?: () => void;
  acceptedBytes?: (output: Record<string, unknown>, n: number) => void;
}

const SITES: SiteSpec[] = [
  {
    slug: "base64-encode-url",
    limit: MAX_DECODED_DOCUMENT_BYTES,
    bigOk: MAX_DECODED_DOCUMENT_BYTES, // exact-limit case doubles as the big control
    refusal: /'url' must be 8\.0MB or less/,
    fetchMock: () => safeFetchMock,
    invoke: () =>
      run("base64-encode-url")({ url: "https://example.com/f" }) as Promise<{
        output: Record<string, unknown>;
      }>,
    acceptedBytes: (output, n) => expect(output.size_bytes).toBe(n),
  },
  {
    slug: "c2pa-inspect",
    limit: 15 * 1024 * 1024,
    bigOk: 12 * 1024 * 1024,
    refusal: /'url' must be 15\.0MB or less/,
    fetchMock: () => safeFetchMock,
    contentType: "image/jpeg",
    invoke: () =>
      run("c2pa-inspect")({ url: "https://example.com/photo.jpg" }) as Promise<{
        output: Record<string, unknown>;
      }>,
    arrange: () => c2paRead.mockResolvedValue(null),
    acceptedBytes: (output, n) => expect(output.bytes_size).toBe(n),
  },
  {
    slug: "website-carbon-estimate",
    limit: MAX_MEASURED_TRANSFER_BYTES,
    // Far past both input caps: a 24 MiB page MUST be measured, not refused —
    // heavy pages are what a carbon estimator exists for.
    bigOk: 24 * 1024 * 1024,
    refusal: /'url' must be a page transferring 100\.0MB or less/,
    fetchMock: () => safeFetchMock,
    contentType: "text/html",
    invoke: () =>
      run("website-carbon-estimate")({ url: "https://example.com" }) as Promise<{
        output: Record<string, unknown>;
      }>,
    acceptedBytes: (output, n) => expect(output.page_size_bytes).toBe(n),
  },
  {
    slug: "html-to-pdf",
    limit: MAX_RENDERED_PDF_BYTES,
    bigOk: 16 * 1024 * 1024,
    refusal: /'url' must be a page whose rendered PDF is 32\.0MB or less/,
    fetchMock: () => browserlessFetchMock,
    invoke: () =>
      run("html-to-pdf")({ url: "https://example.com" }) as Promise<{
        output: Record<string, unknown>;
      }>,
    acceptedBytes: (output, n) => expect(output.size_bytes).toBe(n),
  },
  {
    slug: "screenshot-url",
    limit: MAX_RENDERED_SCREENSHOT_BYTES,
    bigOk: 8 * 1024 * 1024,
    refusal: /'url' must be a page whose screenshot renders to 32\.0MB or less/,
    fetchMock: () => browserlessFetchMock,
    invoke: () =>
      run("screenshot-url")({ url: "https://example.com" }) as Promise<{
        output: Record<string, unknown>;
      }>,
    acceptedBytes: (output, n) => expect(output.size_bytes).toBe(n),
  },
  {
    slug: "landing-page-roast",
    limit: MAX_DECODED_IMAGE_BYTES,
    bigOk: 3 * 1024 * 1024,
    refusal: /'url' must be a page whose screenshot is 4\.0MB or less/,
    fetchMock: () => browserlessFetchMock,
    invoke: () =>
      run("landing-page-roast")({ url: "https://example.com" }) as Promise<{
        output: Record<string, unknown>;
      }>,
    arrange: () =>
      messagesCreate.mockResolvedValue({
        stop_reason: "end_turn",
        content: [
          { type: "text", text: '{"first_impression": "fine", "score": 7}' },
        ],
      }),
  },
];

describe.each(SITES)("$slug byte boundary", (site) => {
  const stream = (bytes: number, declare?: number) =>
    streamingResponse(bytes, { declare, contentType: site.contentType });

  it("accepts a small body", async () => {
    site.arrange?.();
    const { response } = stream(3 * CHUNK, 3 * CHUNK);
    site.fetchMock().mockResolvedValue(response);
    const result = await site.invoke();
    site.acceptedBytes?.(result.output, 3 * CHUNK);
  });

  it(`accepts a realistically LARGE body (${(site.bigOk / 1024 / 1024).toFixed(0)} MiB) — the cap is not accidentally tiny`, async () => {
    site.arrange?.();
    const { response } = stream(site.bigOk);
    site.fetchMock().mockResolvedValue(response);
    const result = await site.invoke();
    site.acceptedBytes?.(result.output, site.bigOk);
  });

  it("accepts a body of exactly the limit", async () => {
    site.arrange?.();
    const { response } = stream(site.limit);
    site.fetchMock().mockResolvedValue(response);
    const result = await site.invoke();
    site.acceptedBytes?.(result.output, site.limit);
  });

  it("refuses limit + 1 streamed with no content-length (chunked case)", async () => {
    site.arrange?.();
    const { response } = stream(site.limit + 1);
    site.fetchMock().mockResolvedValue(response);
    await expect(site.invoke()).rejects.toThrow(site.refusal);
  });

  it("refuses a declared over-limit content-length WITHOUT pulling, and cancels the body", async () => {
    site.arrange?.();
    const { response, pulls, cancelled } = stream(site.limit + CHUNK, site.limit + 1);
    site.fetchMock().mockResolvedValue(response);
    await expect(site.invoke()).rejects.toThrow(/it declared/);
    expect(pulls(), "body was consumed despite an over-limit declaration").toBe(0);
    expect(cancelled(), "unconsumed body was not cancelled (pins the connection)").toBe(true);
  });

  it("does NOT trust an understated content-length — the byte counter refuses", async () => {
    site.arrange?.();
    const { response } = stream(site.limit + CHUNK, 1024);
    site.fetchMock().mockResolvedValue(response);
    await expect(site.invoke()).rejects.toThrow(site.refusal);
  });

  it("an upstream HTTP failure keeps its existing (non-refusal) shape", async () => {
    site.arrange?.();
    site.fetchMock().mockResolvedValue(new Response(null, { status: 502 }));
    await expect(site.invoke()).rejects.toThrow(/502/);
  });
});

describe("c2pa-inspect enforcement ordering", () => {
  it("an unsupported content-type refusal cancels the unconsumed body", async () => {
    // Round-1 review find: throwing on the media-type check with the body
    // open pins the keep-alive connection until GC, and a wrong content-type
    // is attacker-cheap to serve.
    const { response, cancelled } = streamingResponse(1024, {
      contentType: "text/html",
    });
    safeFetchMock.mockResolvedValue(response);
    await expect(run("c2pa-inspect")({ url: "https://example.com/p" })).rejects.toThrow(
      /Unsupported media type/,
    );
    expect(cancelled(), "refused body left unconsumed").toBe(true);
  });

  it("an over-limit body never reaches the native c2pa parser", async () => {
    const { response } = streamingResponse(15 * 1024 * 1024 + CHUNK, {
      contentType: "image/jpeg",
    });
    safeFetchMock.mockResolvedValue(response);
    await expect(run("c2pa-inspect")({ url: "https://example.com/p.jpg" })).rejects.toThrow(
      /'url' must be 15\.0MB or less/,
    );
    expect(c2paRead, "oversized bytes reached the native parser").not.toHaveBeenCalled();
  });
});

// ─── annual-report-extract: scraped link, safeFetch, graceful degradation ────

describe("annual-report-extract PDF leg", () => {
  const PAGE_TEXT = "Årsredovisning nyckeltal omsättning resultat ".repeat(30); // > 500 chars
  const HTML = `<html><body><a href="https://cdn.example/report-2024.pdf">Ladda ner</a><p>${PAGE_TEXT}</p></body></html>`;

  const arrange = (pdfHandle: { response: Response }) => {
    browserlessFetchMock.mockResolvedValue(new Response(HTML, { status: 200 }));
    safeFetchMock.mockResolvedValue(pdfHandle.response);
    messagesCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: '{"company_name": "Acme AB", "org_number": "556000-0000", "revenue_sek": 1000}',
        },
      ],
    });
  };

  /** The content block shape of the message sent to the LLM. */
  const sentBlockTypes = () => {
    const call = messagesCreate.mock.calls[0]?.[0] as {
      messages: Array<{ content: Array<{ type: string }> | string }>;
    };
    const content = call.messages[0].content;
    return typeof content === "string" ? ["string"] : content.map((b) => b.type);
  };

  it("fetches the scraped link through safeFetch (SSRF wrapper), not raw fetch", async () => {
    arrange(streamingResponse(4096));
    await run("annual-report-extract")({ org_number: "556000-0000" });
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    expect(safeFetchMock.mock.calls[0][0]).toBe("https://cdn.example/report-2024.pdf");
  });

  it("an in-bounds PDF is sent to the LLM as a document", async () => {
    arrange(streamingResponse(4096));
    await run("annual-report-extract")({ org_number: "556000-0000" });
    expect(sentBlockTypes()).toContain("document");
  });

  it("an OVERSIZED PDF is not buffered — it degrades to the page-text strategy", async () => {
    arrange(streamingResponse(MAX_DECODED_DOCUMENT_BYTES + CHUNK));
    await run("annual-report-extract")({ org_number: "556000-0000" });
    // Refusal was swallowed by the existing fall-through; the LLM got TEXT,
    // not an 8+ MiB document.
    expect(sentBlockTypes()).not.toContain("document");
  });

  it("a safeFetch refusal (SSRF-blocked link) also degrades instead of failing the call", async () => {
    browserlessFetchMock.mockResolvedValue(new Response(HTML, { status: 200 }));
    safeFetchMock.mockRejectedValue(new Error("Resolved host targets a restricted address."));
    messagesCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"company_name": "Acme AB"}' }],
    });
    await run("annual-report-extract")({ org_number: "556000-0000" });
    expect(sentBlockTypes()).not.toContain("document");
  });
});

// ─── helper level: countBodyBytes ────────────────────────────────────────────

describe("countBodyBytes", () => {
  it("returns the exact count for a body at the limit, retaining nothing", async () => {
    const { response } = streamingResponse(MAX_MEASURED_TRANSFER_BYTES);
    const n = await countBodyBytes(response, MAX_MEASURED_TRANSFER_BYTES, "url");
    expect(n).toBe(MAX_MEASURED_TRANSFER_BYTES);
  });

  it("refuses limit + 1", async () => {
    const { response } = streamingResponse(MAX_MEASURED_TRANSFER_BYTES + 1);
    await expect(
      countBodyBytes(response, MAX_MEASURED_TRANSFER_BYTES, "url"),
    ).rejects.toThrow(ImageLimitError);
  });

  it("refuses a declared over-limit length without pulling, and cancels", async () => {
    const { response, pulls, cancelled } = streamingResponse(10, {
      declare: MAX_MEASURED_TRANSFER_BYTES + 1,
    });
    await expect(
      countBodyBytes(response, MAX_MEASURED_TRANSFER_BYTES, "url"),
    ).rejects.toThrow(/it declared/);
    expect(pulls()).toBe(0);
    expect(cancelled()).toBe(true);
  });

  it("an empty body counts as zero", async () => {
    const { response } = streamingResponse(0);
    expect(await countBodyBytes(response, 1024, "url")).toBe(0);
  });
});

// ─── helper level: normalizeBase64 ordering regression (#426) ────────────────

describe("normalizeBase64 strips whitespace before the data-URI prefix", () => {
  it("a data URI behind leading whitespace is properly stripped", () => {
    // Pre-fix, the prefix test ran first, missed `data:` behind the space,
    // and the whole prefixed string was measured and decoded.
    expect(normalizeBase64(" data:image/png;base64,AAAA")).toBe("AAAA");
    expect(normalizeBase64("\ndata:application/pdf;base64,aGVsbG8=")).toBe("aGVsbG8=");
  });

  it("whitespace inside the prefix no longer defeats stripping", () => {
    expect(normalizeBase64("data: image/png;base64,AAAA")).toBe("AAAA");
  });

  it("the measured string is the stripped one (checkedBase64 returns it)", () => {
    expect(checkedBase64(" data:image/png;base64,AAAA", 1024)).toBe("AAAA");
  });

  it("plain payloads are unchanged", () => {
    expect(normalizeBase64("aGVs bG8=")).toBe("aGVsbG8=");
    expect(normalizeBase64("aGVsbG8=")).toBe("aGVsbG8=");
  });
});

// ─── failure taxonomy ────────────────────────────────────────────────────────

describe("failure taxonomy", () => {
  it("POSITIVE CONTROL: every #426 refusal shape classifies caller_input and is floor-exempt", () => {
    const messages = [
      "'url' must be 8.0MB or less.",
      "'url' must be 15.0MB or less (it declared 20.0MB).",
      "'url' must be a page transferring 100.0MB or less.",
      "'url' must be a page whose rendered PDF is 32.0MB or less.",
      "'html' must be a page whose rendered PDF is 32.0MB or less (it declared 40.0MB).",
      "'url' must be a page whose screenshot renders to 32.0MB or less.",
      "'url' must be a page whose screenshot is 4.0MB or less.",
    ];
    for (const msg of messages) {
      const cls = classifyTransactionFailure(msg);
      expect(cls, `"${msg}" classified ${cls}`).toBe("caller_input");
      expect(countsAgainstCapability(cls)).toBe(false);
    }
  });

  it("NEGATIVE CONTROL: a Browserless HTTP failure is not rebadged caller_input", () => {
    const cls = classifyTransactionFailure(
      "Browserless PDF returned HTTP 500: something broke upstream",
    );
    expect(cls).not.toBe("caller_input");
  });
});

// ─── structural wiring: the seven residual files ─────────────────────────────

describe("all seven residual sites are wired to the shared enforcement", () => {
  const FILES = [
    "base64-encode-url.ts",
    "c2pa-inspect.ts",
    "website-carbon-estimate.ts",
    "annual-report-extract.ts",
    "html-to-pdf.ts",
    "screenshot-url.ts",
    "landing-page-roast.ts",
  ];

  const srcCache = new Map<string, string>();
  const src = (f: string) => {
    let s = srcCache.get(f);
    if (!s) {
      s = readFileSync(resolve(__dirname, f), "utf-8");
      srcCache.set(f, s);
    }
    return s;
  };

  it.each(FILES)("%s never buffers a response with arrayBuffer()", (f) => {
    expect(src(f)).not.toMatch(/await\s+\w+\.arrayBuffer\(/);
  });

  it.each(FILES)("%s reads bodies through the shared bounded helpers", (f) => {
    expect(src(f)).toMatch(/readBodyWithLimit\(|countBodyBytes\(/);
  });

  it("annual-report-extract fetches its scraped link with safeFetch and has no raw fetch()", () => {
    const s = src("annual-report-extract.ts");
    expect(s).toMatch(/safeFetch\(/);
    // Bare lowercase `fetch(` — browserlessFetch/safeFetch don't match.
    expect(s).not.toMatch(/(?<![A-Za-z.])fetch\(/);
  });

  it.each(["base64-encode-url.ts", "c2pa-inspect.ts", "website-carbon-estimate.ts"])(
    "%s (direct caller URL) fetches via safeFetch only",
    (f) => {
      const s = src(f);
      expect(s).toMatch(/safeFetch\(/);
      expect(s).not.toMatch(/(?<![A-Za-z.])fetch\(/);
    },
  );

  it("NO capability file in the directory buffers with arrayBuffer() — including future ones", () => {
    // Round-3 review find: the per-file lists above are static, so an eighth
    // capability added later with `await resp.arrayBuffer()` would evade both
    // this file and input-byte-limits.test.ts. After #426 the ONLY sanctioned
    // sites are image-limits.ts's own bodyless-response fallbacks, so the
    // sweep can be directory-wide: a new offender fails here by existing.
    const offenders: string[] = [];
    for (const entry of readdirSync(__dirname)) {
      if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
      if (/await\s+\w+\.arrayBuffer\(/.test(src(entry))) offenders.push(entry);
    }
    expect(offenders, "unbounded arrayBuffer() buffering reintroduced").toEqual([]);
  });

  it("the render caps come from the named authority constants", () => {
    expect(src("html-to-pdf.ts")).toContain("MAX_RENDERED_PDF_BYTES");
    expect(src("screenshot-url.ts")).toContain("MAX_RENDERED_SCREENSHOT_BYTES");
    expect(src("landing-page-roast.ts")).toContain("MAX_DECODED_IMAGE_BYTES");
    expect(src("website-carbon-estimate.ts")).toContain("MAX_MEASURED_TRANSFER_BYTES");
    expect(src("base64-encode-url.ts")).toContain("MAX_DECODED_DOCUMENT_BYTES");
    expect(src("annual-report-extract.ts")).toContain("MAX_DECODED_DOCUMENT_BYTES");
    // No local cap-shaped constant declarations (c2pa's named 15 MB product
    // constant is the sanctioned exception — it predates #412). Narrow to
    // MAX_*-shaped declarations: website-carbon-estimate legitimately holds
    // methodology numbers (median page size, recommendation thresholds) that
    // are not caps.
    for (const f of FILES.filter((x) => x !== "c2pa-inspect.ts")) {
      expect(src(f), `${f} declares a local byte cap`).not.toMatch(
        /const\s+MAX_[A-Z_]+\s*=\s*\d+(\.\d+)?\s*\*\s*1024\s*\*\s*1024/,
      );
    }
  });
});
