/**
 * #412 — the six x402 document/image capabilities must bound caller-controlled
 * input bytes BEFORE they are resident, on both input paths.
 *
 * ## What was wrong
 *
 * All six called `await response.arrayBuffer()` on a caller-supplied URL. By
 * the time that promise resolves the bytes are already in memory, so the one
 * existing check (image-to-text's 4 MiB, URL path only) reported a limit
 * without enforcing one, and the other five had nothing at all. The base64
 * inputs were never measured on any of the six.
 *
 * ## What these tests prove
 *
 * 1. URL bodies are STREAM-bounded: over-limit responses are refused while
 *    being read, a declared over-limit content-length is refused before a
 *    single chunk is pulled, and a lying (understated) content-length is
 *    caught by the actual byte counter.
 * 2. base64 inputs are measured from the string — the SAME normalised string
 *    that is sent downstream — and refused before anything is allocated or
 *    forwarded.
 * 3. In every refusal case the downstream LLM client is never constructed-
 *    called, which is the enforcement claim ("never reached the paid/expensive
 *    stage"), not just the error-message claim.
 * 4. Refusals classify as `caller_input` (armed-quality-floor exempt), and a
 *    genuine upstream failure does NOT get misclassified as caller_input.
 * 5. All six capabilities are wired to the ONE shared helper — checked
 *    structurally against the source, so a seventh copy-paste path or a
 *    regression to arrayBuffer() fails loudly.
 *
 * Mocking pattern follows image-resize.limits.test.ts (safeFetch mocked so the
 * URL branch runs without a network; safe-fetch's own SSRF behaviour is
 * covered by its own tests) and pii-redact-truncation.test.ts (Anthropic SDK
 * mocked directly).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));
const safeFetchMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

vi.mock("../lib/safe-fetch.js", () => ({
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));

import { getDirectExecutor } from "./index.js";
import "./pdf-extract.js";
import "./invoice-extract.js";
import "./contract-extract.js";
import "./resume-parse.js";
import "./receipt-categorize.js";
import "./image-to-text.js";
import {
  MAX_DECODED_IMAGE_BYTES,
  MAX_DECODED_DOCUMENT_BYTES,
  normalizeBase64,
  readBodyWithLimit,
  ImageLimitError,
} from "./lib/image-limits.js";
import {
  classifyTransactionFailure,
  countsAgainstCapability,
} from "../lib/transaction-failure-taxonomy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CHUNK = 64 * 1024;

/**
 * A Response that streams exactly `totalBytes` (last chunk sliced, so the
 * byte count is precise), optionally declaring a content-length, and counting
 * how many chunks were actually pulled — the "refused before consuming the
 * body" assertions need that counter.
 */
function streamingResponse(
  totalBytes: number,
  opts: { declare?: number; contentType?: string } = {},
): { response: Response; pulls: () => number } {
  let sent = 0;
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(ctrl) {
        if (sent >= totalBytes) {
          ctrl.close();
          return;
        }
        pulls++;
        const size = Math.min(CHUNK, totalBytes - sent);
        ctrl.enqueue(new Uint8Array(size));
        sent += size;
      },
    },
    // highWaterMark 0: the default (1) makes the stream pull one chunk
    // eagerly at construction, before any reader attaches — which would make
    // the "refused without pulling the body" counter read 1 for a body nobody
    // consumed.
    { highWaterMark: 0 },
  );
  const headers = new Headers();
  if (opts.declare !== undefined) headers.set("content-length", String(opts.declare));
  if (opts.contentType) headers.set("content-type", opts.contentType);
  return { response: new Response(body, { status: 200, headers }), pulls: () => pulls };
}

interface CapSpec {
  slug: string;
  limit: number;
  /** The URL field this capability documents first — what the refusal names. */
  urlField: string;
  urlInput: (url: string) => Record<string, unknown>;
  contentType: string;
  /** JSON the mocked LLM answers with — must parse and be non-empty. */
  llmJson: string;
}

const DOC = MAX_DECODED_DOCUMENT_BYTES;
const IMG = MAX_DECODED_IMAGE_BYTES;

const CAPS: CapSpec[] = [
  {
    slug: "pdf-extract",
    limit: DOC,
    urlField: "url",
    urlInput: (url) => ({ url }),
    contentType: "application/pdf",
    llmJson: '{"title": "Test Document"}',
  },
  {
    slug: "invoice-extract",
    limit: DOC,
    urlField: "url",
    urlInput: (url) => ({ url }),
    contentType: "application/pdf",
    llmJson: '{"vendor_name": "Acme AB", "total_amount": 125}',
  },
  {
    slug: "contract-extract",
    limit: DOC,
    urlField: "pdf_url",
    urlInput: (url) => ({ pdf_url: url }),
    contentType: "application/pdf",
    llmJson: '{"document_type": "NDA", "summary": "A test agreement."}',
  },
  {
    slug: "resume-parse",
    limit: DOC,
    urlField: "pdf_url",
    urlInput: (url) => ({ pdf_url: url }),
    contentType: "application/pdf",
    llmJson: '{"name": "Jane Tester", "skills": ["testing"]}',
  },
  {
    slug: "receipt-categorize",
    limit: IMG,
    urlField: "image_url",
    urlInput: (url) => ({ image_url: url }),
    contentType: "image/png",
    llmJson: '{"vendor_name": "Cafe", "total_amount": 5, "category": "meals"}',
  },
  {
    slug: "image-to-text",
    limit: IMG,
    urlField: "image_url",
    urlInput: (url) => ({ image_url: url }),
    contentType: "image/png",
    llmJson: '{"text": "hello", "confidence": "high", "language_detected": "en", "text_type": "printed"}',
  },
];

const run = (slug: string) => getDirectExecutor(slug)!;

function mockLlmSuccess(json: string): void {
  messagesCreate.mockResolvedValue({
    stop_reason: "end_turn",
    content: [{ type: "text", text: json }],
  });
}

/** The image/document content block the capability handed to the LLM mock. */
function sentSource(): { data?: string } {
  const call = messagesCreate.mock.calls[0]?.[0] as {
    messages: Array<{ content: Array<{ source?: { data?: string } }> | string }>;
  };
  const content = call.messages[0].content;
  if (typeof content === "string") return {};
  return content.find((b) => b.source)?.source ?? {};
}

beforeEach(() => {
  messagesCreate.mockReset();
  safeFetchMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

// ─── URL path: stream-bounded fetch ──────────────────────────────────────────

describe.each(CAPS)("$slug URL path", (cap) => {
  const mib = cap.limit / 1024 / 1024;
  const refusal = new RegExp(`'${cap.urlField}' must be ${mib.toFixed(1)}MB or less`);

  it(`refuses a streamed body over ${mib} MiB with no content-length (chunked case)`, async () => {
    const { response } = streamingResponse(cap.limit + CHUNK, { contentType: cap.contentType });
    safeFetchMock.mockResolvedValue(response);
    await expect(run(cap.slug)(cap.urlInput("https://example.com/f"))).rejects.toThrow(refusal);
    expect(messagesCreate, "oversized bytes reached the LLM stage").not.toHaveBeenCalled();
  });

  it("refuses a declared over-limit content-length WITHOUT pulling the body", async () => {
    const { response, pulls } = streamingResponse(cap.limit + CHUNK, {
      declare: cap.limit + 1,
      contentType: cap.contentType,
    });
    safeFetchMock.mockResolvedValue(response);
    await expect(run(cap.slug)(cap.urlInput("https://example.com/f"))).rejects.toThrow(
      /it declared/,
    );
    expect(pulls(), "body was consumed despite an over-limit declaration").toBe(0);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("does NOT trust an understated content-length — the byte counter refuses", async () => {
    const { response } = streamingResponse(cap.limit + CHUNK, {
      declare: 1024, // lie: claims 1 KiB, streams past the cap
      contentType: cap.contentType,
    });
    safeFetchMock.mockResolvedValue(response);
    await expect(run(cap.slug)(cap.urlInput("https://example.com/f"))).rejects.toThrow(refusal);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("POSITIVE CONTROL: accepts a small body and forwards exactly those bytes", async () => {
    const { response } = streamingResponse(1024, {
      declare: 1024,
      contentType: cap.contentType,
    });
    safeFetchMock.mockResolvedValue(response);
    mockLlmSuccess(cap.llmJson);
    await run(cap.slug)(cap.urlInput("https://example.com/f"));
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    // 1024 bytes → base64 of length 4·ceil(1024/3) = 1368: the caps did not
    // quietly truncate or re-buffer.
    expect(sentSource().data?.length).toBe(1368);
  });

  it("still fetches through safeFetch (SSRF wrapper), not raw fetch", async () => {
    const { response } = streamingResponse(16, { contentType: cap.contentType });
    safeFetchMock.mockResolvedValue(response);
    mockLlmSuccess(cap.llmJson);
    await run(cap.slug)(cap.urlInput("https://example.com/f"));
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    expect(safeFetchMock.mock.calls[0][0]).toBe("https://example.com/f");
  });

  it("a safeFetch refusal (SSRF / ToS / redirect cap) propagates unchanged", async () => {
    safeFetchMock.mockRejectedValue(new Error("Resolved host targets a restricted address."));
    await expect(run(cap.slug)(cap.urlInput("https://evil.example/f"))).rejects.toThrow(
      "Resolved host targets a restricted address.",
    );
    expect(messagesCreate).not.toHaveBeenCalled();
  });
});

describe("URL-path byte boundary is exact", () => {
  // One capability per media class; the helper is shared, so the boundary
  // behaviour is the same across the other four.
  it("receipt-categorize accepts exactly 4 MiB", async () => {
    const { response } = streamingResponse(IMG, { contentType: "image/png" });
    safeFetchMock.mockResolvedValue(response);
    mockLlmSuccess('{"vendor_name": "Cafe", "total_amount": 5}');
    await run("receipt-categorize")({ image_url: "https://example.com/r.png" });
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("receipt-categorize refuses 4 MiB + 1 byte", async () => {
    const { response } = streamingResponse(IMG + 1, { contentType: "image/png" });
    safeFetchMock.mockResolvedValue(response);
    await expect(
      run("receipt-categorize")({ image_url: "https://example.com/r.png" }),
    ).rejects.toThrow(/'image_url' must be 4\.0MB or less/);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("pdf-extract accepts exactly 8 MiB", async () => {
    const { response } = streamingResponse(DOC, { contentType: "application/pdf" });
    safeFetchMock.mockResolvedValue(response);
    mockLlmSuccess('{"title": "Big but legal"}');
    await run("pdf-extract")({ url: "https://example.com/d.pdf" });
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("pdf-extract refuses 8 MiB + 1 byte", async () => {
    const { response } = streamingResponse(DOC + 1, { contentType: "application/pdf" });
    safeFetchMock.mockResolvedValue(response);
    await expect(run("pdf-extract")({ url: "https://example.com/d.pdf" })).rejects.toThrow(
      /'url' must be 8\.0MB or less/,
    );
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("an empty body is not refused by the size guard", async () => {
    const { response } = streamingResponse(0, { contentType: "application/pdf" });
    safeFetchMock.mockResolvedValue(response);
    mockLlmSuccess('{"title": "empty"}');
    await run("pdf-extract")({ url: "https://example.com/d.pdf" });
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    expect(sentSource().data).toBe("");
  });

  it("an upstream HTTP failure keeps its existing (non-refusal) shape", async () => {
    safeFetchMock.mockResolvedValue(new Response(null, { status: 502 }));
    await expect(run("pdf-extract")({ url: "https://example.com/d.pdf" })).rejects.toThrow(
      /Failed to fetch PDF: HTTP 502/,
    );
  });
});

// ─── base64 path: measured before anything is allocated or forwarded ─────────

// Built once per distinct limit (two, not six) — each is a multi-MB
// alloc+encode that would otherwise repeat per capability.
const overLimitB64ByLimit = new Map<number, string>();
function overLimitB64(limit: number): string {
  let b64 = overLimitB64ByLimit.get(limit);
  if (!b64) {
    b64 = Buffer.alloc(limit + 1).toString("base64");
    overLimitB64ByLimit.set(limit, b64);
  }
  return b64;
}

describe.each(CAPS)("$slug base64 path", (cap) => {
  it("refuses a payload decoding to limit + 1 and never reaches the LLM stage", async () => {
    // Canonical, well-formed base64 of exactly limit + 1 decoded bytes — the
    // tightest possible discrimination: a capability whose effective base64
    // cap silently drifted even one byte upward fails this.
    await expect(run(cap.slug)({ base64: overLimitB64(cap.limit) })).rejects.toThrow(
      /'base64' must be .* or less once decoded/,
    );
    expect(messagesCreate, "oversized base64 reached the LLM stage").not.toHaveBeenCalled();
  });

  it("MEASURE-EQUALS-USE: what is sent downstream is the exact normalised string", async () => {
    const raw = "data:application/pdf;base64,aGVs bG8g\nd29ybGQh"; // prefix + whitespace
    mockLlmSuccess(cap.llmJson);
    await run(cap.slug)({ base64: raw });
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    // The size guard measured normalizeBase64(raw); anything else being
    // forwarded would reopen the measure-one-string-decode-another gap.
    expect(sentSource().data).toBe(normalizeBase64(raw));
    expect(sentSource().data).toBe("aGVsbG8gd29ybGQh");
  });

  it("accepts an unpadded payload (existing tolerance preserved)", async () => {
    mockLlmSuccess(cap.llmJson);
    await run(cap.slug)({ base64: "aGVsbG8" }); // 7 chars, no '='
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("malformed base64 is NOT converted into a size refusal", async () => {
    // Existing semantics: these six never decoded locally, so a malformed
    // payload flows to the upstream API and fails there. The size guard must
    // not change that classification for small payloads.
    mockLlmSuccess(cap.llmJson);
    await expect(run(cap.slug)({ base64: "!!!!not-base64!!!!" })).resolves.toBeDefined();
  });
});

describe("base64 boundary semantics", () => {
  // limit + 1 refusal for every capability is covered by the describe.each
  // block above (same canonical Buffer-derived payload, per-capability).

  it("a payload measured exactly at the limit is accepted (document, 8 MiB)", async () => {
    // 8 MiB − 2 is divisible by 3, so its base64 needs no padding and the
    // ceil(3L/4) upper bound lands exactly on the true decoded size.
    const b64 = Buffer.alloc(DOC - 2).toString("base64");
    expect(b64.endsWith("=")).toBe(false);
    mockLlmSuccess('{"title": "at the limit"}');
    await run("pdf-extract")({ base64: b64 });
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("DOCUMENTED CONSERVATISM: a padded payload decoding to exactly the limit is refused", async () => {
    // 8 MiB is not divisible by 3, so its canonical base64 carries padding and
    // the deliberate upper-bound measure (image-limits.ts: "may over-estimate
    // by two bytes; may never under-estimate by one") lands at limit + 1.
    // Same shipped semantics as image-resize; recorded here so a future
    // "fix" that makes the measure exact-but-underestimating fails this file.
    const b64 = Buffer.alloc(DOC).toString("base64");
    expect(b64.endsWith("=")).toBe(true);
    await expect(run("pdf-extract")({ base64: b64 })).rejects.toThrow(
      /'base64' must be 8\.0MB or less once decoded/,
    );
  });
});

// ─── shared-helper maxBytes plumbing ─────────────────────────────────────────

describe("readBodyWithLimit maxBytes parameterisation", () => {
  it("a 6 MiB stream passes an 8 MiB cap (the document limit is not silently 4 MiB)", async () => {
    const { response } = streamingResponse(6 * 1024 * 1024, {});
    const buf = await readBodyWithLimit(response, DOC, "url");
    expect(buf.byteLength).toBe(6 * 1024 * 1024);
  });

  it("REGRESSION (#412): the no-stream fallback honours maxBytes too", async () => {
    // Pre-fix, this branch called assertDecodedSizeWithinLimit without
    // forwarding maxBytes, silently shrinking every non-default cap to 4 MiB.
    const six = 6 * 1024 * 1024;
    const fake = {
      headers: new Headers(),
      body: null,
      arrayBuffer: async () => new ArrayBuffer(six),
    } as unknown as Response;
    const buf = await readBodyWithLimit(fake, DOC, "url");
    expect(buf.byteLength).toBe(six);
    // And the cap still binds on that branch:
    const fakeOver = {
      headers: new Headers(),
      body: null,
      arrayBuffer: async () => new ArrayBuffer(DOC + 1),
    } as unknown as Response;
    await expect(readBodyWithLimit(fakeOver, DOC, "url")).rejects.toThrow(ImageLimitError);
  });
});

// ─── failure taxonomy: refusals are caller_input, upstream faults are not ────

describe("failure taxonomy", () => {
  it("POSITIVE CONTROL: every refusal shape classifies caller_input and is floor-exempt", async () => {
    const collected: string[] = [];

    // URL stream refusal
    const { response } = streamingResponse(DOC + CHUNK, { contentType: "application/pdf" });
    safeFetchMock.mockResolvedValue(response);
    await run("pdf-extract")({ url: "https://example.com/d.pdf" }).catch((e: Error) =>
      collected.push(e.message),
    );
    // URL declared-content-length refusal
    const declared = streamingResponse(16, { declare: DOC + 1, contentType: "application/pdf" });
    safeFetchMock.mockResolvedValue(declared.response);
    await run("pdf-extract")({ url: "https://example.com/d.pdf" }).catch((e: Error) =>
      collected.push(e.message),
    );
    // base64 refusal
    await run("image-to-text")({
      base64: "a".repeat(Math.ceil(((IMG + 1024 * 1024) * 4) / 3)),
    }).catch((e: Error) => collected.push(e.message));

    expect(collected).toHaveLength(3);
    for (const msg of collected) {
      const cls = classifyTransactionFailure(msg);
      expect(cls, `"${msg}" classified ${cls}`).toBe("caller_input");
      expect(countsAgainstCapability(cls)).toBe(false);
    }
  });

  it("NEGATIVE CONTROL: a genuine upstream failure is not rebadged caller_input", () => {
    const cls = classifyTransactionFailure("Failed to fetch PDF: HTTP 502");
    expect(cls).not.toBe("caller_input");
  });

  it("the armed quality floor's own authority excuses the refusal", async () => {
    // outcomeFromError is the sole authority (WP9) on whether a failure counts
    // against a capability. Asserting on classifyTransactionFailure alone
    // would leave the actual floor junction untested.
    const { outcomeFromError } = await import("../lib/execution-outcome.js");
    const outcome = outcomeFromError(
      new ImageLimitError("'url' must be 8.0MB or less (it declared 9.5MB)."),
    );
    expect(outcome.counts_against_capability).toBe(false);
    expect(outcome.billable).toBe(false);
  });
});

// ─── structural wiring: all six capabilities, one authority ──────────────────

describe("all six capabilities are wired to the shared enforcement", () => {
  const FILES = [
    "pdf-extract.ts",
    "invoice-extract.ts",
    "contract-extract.ts",
    "resume-parse.ts",
    "receipt-categorize.ts",
    "image-to-text.ts",
    // Not part of #412's six, but the sibling the shared helpers were
    // originally extracted for — held to the same structural bar so it cannot
    // drift back to hand-composed primitives.
    "image-resize.ts",
  ];
  const DOC_FILES = new Set([
    "pdf-extract.ts",
    "invoice-extract.ts",
    "contract-extract.ts",
    "resume-parse.ts",
  ]);

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
    // `await x.arrayBuffer(` is the unbounded read this issue removed; the
    // pattern requires `await` so prose in comments cannot satisfy or trip it.
    expect(src(f)).not.toMatch(/await\s+\w+\.arrayBuffer\(/);
  });

  it.each(FILES)("%s streams through readBodyWithLimit and fetches via safeFetch", (f) => {
    const s = src(f);
    expect(s).toMatch(/readBodyWithLimit\(/);
    expect(s).toMatch(/safeFetch\(/);
    // No raw fetch() anywhere — the size limit must compose with the SSRF
    // wrapper, not replace it.
    expect(s).not.toMatch(/(?<![A-Za-z.])fetch\(/);
  });

  it.each(FILES)("%s bounds base64 through the sealed checkedBase64 helper", (f) => {
    // checkedBase64 normalises, measures the normalised string, and returns
    // it — so its presence, plus the absence of the raw primitives, proves the
    // measure-what-you-send invariant by construction rather than by ritual.
    const s = src(f);
    expect(s).toMatch(/checkedBase64\(/);
    expect(s, `${f} composes the base64 primitives by hand`).not.toMatch(
      /normalizeBase64\(|decodedLengthOfBase64\(|assertDecodedSizeWithinLimit\(/,
    );
  });

  it.each(FILES)("%s uses the named shared constant for its media class", (f) => {
    const expected = DOC_FILES.has(f) ? "MAX_DECODED_DOCUMENT_BYTES" : "MAX_DECODED_IMAGE_BYTES";
    const wrong = DOC_FILES.has(f) ? "MAX_DECODED_IMAGE_BYTES" : "MAX_DECODED_DOCUMENT_BYTES";
    const s = src(f);
    expect(s).toContain(expected);
    expect(s, `${f} mixes media-class limits`).not.toContain(wrong);
    // And no local magic-number re-declaration of a byte cap:
    expect(s).not.toMatch(/=\s*[48]\s*\*\s*1024\s*\*\s*1024/);
  });
});
