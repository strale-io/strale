/**
 * `image-resize` must refuse oversized and over-ambitious requests BEFORE any
 * bytes reach sharp/libvips.
 *
 * ## Why a rail body cap is not enough
 *
 * The `/x402/*` body cap added alongside this bounds the wire. It says nothing
 * about how much work a *small* request can buy, and measuring that turned up
 * a much cheaper attack than an oversized body. From a **235-byte** source
 * image, varying only the requested output dimensions (sharp 0.35.3 /
 * libvips 8.18.3):
 *
 *     2,000 x 2,000      60 KB       88 ms
 *     10,000 x 10,000    1.3 MB      2.1 s
 *     30,000 x 30,000    11.9 MB     5.8 s
 *     100,000 x 100,000  131 MB      95.8 s
 *
 * A few hundred bytes buys 96 seconds of CPU and a 131 MB allocation. No body
 * limit can see that, because the request is tiny — the amplification is in
 * the parameters, so the limit has to be there too.
 *
 * ## Why sharp is spied on rather than trusted
 *
 * "Refuses oversized input" and "oversized input never reaches the decoder"
 * are different claims, and only the second one is the security property. A
 * test that asserts the error message proves the first. These assert the
 * decoder was never constructed, which is the one that matters when the
 * decoder is native code with memory-safety advisories against it.
 *
 * The spy delegates to the real sharp, so the success cases below still
 * exercise the actual pipeline.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const sharpCalls = vi.fn();
const safeFetchMock = vi.fn();

// safeFetch is mocked so the URL branch can be driven without a network. Its
// own SSRF behaviour is covered by ssrf-bucket-a.test.ts; what is under test
// here is what image-resize does with the RESPONSE.
vi.mock("../lib/safe-fetch.js", () => ({
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));

vi.mock("sharp", async (importOriginal) => {
  const actual = (await importOriginal()) as { default: unknown };
  const real = actual.default as (...args: unknown[]) => unknown;
  const spy = (...args: unknown[]) => {
    sharpCalls(...args);
    return real(...args);
  };
  return { default: Object.assign(spy, real) };
});

import sharp from "sharp";
import "./image-resize.js";
import { getExecutor } from "./index.js";
import {
  assertDecodedSizeWithinLimit,
  effectiveOutputGeometry,
  assertEffectiveGeometryWithinLimit,
  stripDataUriPrefix,
  normalizeBase64,
  MAX_DECODED_IMAGE_BYTES,
  MAX_OUTPUT_DIMENSION,
  MAX_OUTPUT_PIXELS,
  decodedLengthOfBase64,
  assertOutputGeometryWithinLimit,
  readBodyWithLimit,
  ImageLimitError,
} from "./lib/image-limits.js";
import { classifyTransactionFailure, countsAgainstCapability } from "../lib/transaction-failure-taxonomy.js";
import { streamingResponse as sharedStreamingResponse } from "./lib/streaming-response-testutil.js";

const run = () => getExecutor("image-resize")!;

/**
 * Thin adapter over the shared factory (#426 review — this file held the
 * original, now-diverged copy). Call sites here only need the Response.
 */
function streamingResponse(totalBytes: number, declare?: number): Response {
  return sharedStreamingResponse(totalBytes, { declare }).response;
}

async function tinyPng(): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer();
}

beforeEach(() => {
  sharpCalls.mockClear();
  safeFetchMock.mockReset();
});

describe("oversized base64 cannot reach sharp/libvips", () => {
  it("refuses a base64 payload over the decoded-size limit", async () => {
    // 'a' is a valid base64 char, so this is a well-formed payload that
    // decodes to ~6 MiB. It is not rejected for being malformed.
    const b64 = "a".repeat(Math.ceil(((MAX_DECODED_IMAGE_BYTES + 2 * 1024 * 1024) * 4) / 3));
    await expect(run()({ base64: b64, target_width: 100 })).rejects.toThrow(
      /'base64' must be .* or less once decoded/,
    );
  });

  it("and sharp was never constructed", async () => {
    const b64 = "a".repeat(Math.ceil(((MAX_DECODED_IMAGE_BYTES + 2 * 1024 * 1024) * 4) / 3));
    await expect(run()({ base64: b64, target_width: 100 })).rejects.toThrow();
    expect(sharpCalls, "oversized bytes reached the native decoder").not.toHaveBeenCalled();
  });

  it("the size is computed WITHOUT decoding the payload", () => {
    // Decoding to measure would allocate the very thing being refused. The
    // helper works from the string length, so this holds for any size.
    const decoded = 9 * 1024 * 1024;
    const b64 = "a".repeat(Math.ceil((decoded * 4) / 3));
    expect(decodedLengthOfBase64(b64)).toBeGreaterThan(MAX_DECODED_IMAGE_BYTES);
  });

  it("POSITIVE CONTROL: the same path accepts a payload under the limit", async () => {
    // Without this, every assertion above would pass on a capability that
    // refused everything.
    const b64 = (await tinyPng()).toString("base64");
    const r = (await run()({ base64: b64, target_width: 32, target_height: 32 })) as {
      output: { width: number; height: number };
    };
    expect(r.output.width).toBe(32);
    expect(sharpCalls).toHaveBeenCalled();
  });
});

describe("output geometry is bounded before anything is decoded", () => {
  it("refuses a single dimension past the per-side cap", async () => {
    const b64 = (await tinyPng()).toString("base64");
    await expect(
      run()({ base64: b64, target_width: MAX_OUTPUT_DIMENSION + 1, target_height: 10 }),
    ).rejects.toThrow(/'target_width' must be \d+px or less/);
  });

  it("refuses an area past the megapixel cap even when both sides are legal", async () => {
    // 10,000 x 10,000 is exactly at the per-side cap and 100 MP — four times
    // the area cap. Without the area check each side would pass individually.
    const b64 = (await tinyPng()).toString("base64");
    await expect(
      run()({
        base64: b64,
        target_width: MAX_OUTPUT_DIMENSION,
        target_height: MAX_OUTPUT_DIMENSION,
      }),
    ).rejects.toThrow(/megapixels or less/);
  });

  it("the 100,000-square case is refused, and sharp is never constructed", async () => {
    const b64 = (await tinyPng()).toString("base64");
    // The fixture is built BY sharp, so the spy has one call on it already.
    // Clearing here rather than in beforeEach is the difference between
    // measuring the executor and measuring the test's own setup — the first
    // version of this assertion failed for exactly that reason.
    sharpCalls.mockClear();

    await expect(
      run()({ base64: b64, target_width: 100_000, target_height: 100_000 }),
    ).rejects.toThrow();
    expect(sharpCalls, "the amplifying request reached the decoder").not.toHaveBeenCalled();
  });

  it("refuses negative, fractional and non-finite dimensions", () => {
    for (const bad of [-1, 0, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => assertOutputGeometryWithinLimit(bad, 10), `accepted ${bad}`).toThrow(
        ImageLimitError,
      );
    }
  });

  it("POSITIVE CONTROL: a realistic large resize is still allowed", async () => {
    // 4000 x 3000 is 12 MP — a normal camera frame, comfortably under the cap.
    expect(() => assertOutputGeometryWithinLimit(4000, 3000)).not.toThrow();
    expect(4000 * 3000).toBeLessThan(MAX_OUTPUT_PIXELS);
  });
});

describe("the geometry cap survives an omitted dimension and fit=outside", () => {
  /**
   * Reviewer-found, and it left the whole amplification attack open. Checking
   * only the REQUESTED dimensions misses two routes to a huge output, and the
   * original tests used square sources, which hid both.
   */

  /** A very tall, narrow source: 100 x 4000. */
  async function tallPng(): Promise<Buffer> {
    return sharp({
      create: { width: 100, height: 4000, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .png()
      .toBuffer();
  }

  it("width-only on a tall source resolves to an enormous height", () => {
    // The arithmetic, stated before the behaviour: 100x4000 asked for
    // target_width 10000 gives a derived height of 400,000. Every value the
    // caller supplied is inside its own cap.
    const g = effectiveOutputGeometry(100, 4000, 10_000, undefined, "cover");
    expect(g).toEqual({ width: 10_000, height: 400_000 });
    expect(() => assertEffectiveGeometryWithinLimit(g.width, g.height)).toThrow(ImageLimitError);
  });

  /** A very wide, short source: 4000 x 100. */
  async function widePng(): Promise<Buffer> {
    return sharp({
      create: { width: 4000, height: 100, channels: 3, background: { r: 7, g: 7, b: 7 } },
    })
      .png()
      .toBuffer();
  }

  it("height-only on a wide source resolves to an enormous width", () => {
    // The mirror of the width-only case, and it was NOT covered: a mutation
    // that stopped deriving the width left every test green.
    const g = effectiveOutputGeometry(4000, 100, undefined, 10_000, "cover");
    expect(g).toEqual({ width: 400_000, height: 10_000 });
    expect(() => assertEffectiveGeometryWithinLimit(g.width, g.height)).toThrow(ImageLimitError);
  });

  it("the EXECUTOR refuses height-only on a wide source", async () => {
    const b64 = (await widePng()).toString("base64");
    await expect(
      run()({ base64: b64, target_height: MAX_OUTPUT_DIMENSION }),
    ).rejects.toThrow(/aspect ratio/);
  });

  it("the EXECUTOR refuses width-only on a tall source", async () => {
    const b64 = (await tallPng()).toString("base64");
    await expect(
      run()({ base64: b64, target_width: MAX_OUTPUT_DIMENSION }),
    ).rejects.toThrow(/aspect ratio/);
  });

  it("fit=outside can exceed both requested edges, and is refused", () => {
    // outside COVERS the requested box, so both output edges can be larger
    // than both requested edges.
    const g = effectiveOutputGeometry(100, 4000, 10_000, 10_000, "outside");
    expect(g.height).toBeGreaterThan(10_000);
    expect(() => assertEffectiveGeometryWithinLimit(g.width, g.height)).toThrow(ImageLimitError);
  });

  it("the EXECUTOR refuses fit=outside that resolves past the caps", async () => {
    const b64 = (await tallPng()).toString("base64");
    await expect(
      run()({ base64: b64, target_width: 5_000, target_height: 5_000, fit: "outside" }),
    ).rejects.toThrow(/aspect ratio/);
  });

  it("never under-estimates what SHARP actually produces", async () => {
    // Compared against sharp itself rather than against my own arithmetic.
    // The reviewer supplied the counterexample this catches: a 1295x560 source
    // asked for 1x3288 at fit=outside resolved to 7603x3288 in the helper and
    // 7604x3288 in sharp, so a request one column over the pixel cap passed.
    // Math.round became Math.ceil; this holds the property rather than the fix.
    const cases: Array<{ w: number; h: number; rw?: number; rh?: number; fit: string }> = [
      { w: 1295, h: 560, rw: 1, rh: 3288, fit: "outside" },
      { w: 1295, h: 560, rw: 3288, rh: 1, fit: "outside" },
      { w: 320, h: 240, rw: 100, rh: 60, fit: "inside" },
      { w: 320, h: 240, rw: 100, rh: 60, fit: "outside" },
      { w: 977, h: 313, rw: 500, rh: 500, fit: "inside" },
      { w: 977, h: 313, rw: 500, rh: 500, fit: "outside" },
      { w: 100, h: 4000, rw: 700, fit: "cover" },
      { w: 4000, h: 100, rh: 700, fit: "cover" },
    ];

    for (const c of cases) {
      const src = await sharp({
        create: { width: c.w, height: c.h, channels: 3, background: { r: 4, g: 5, b: 6 } },
      })
        .png()
        .toBuffer();
      const actual = await sharp(src)
        .resize(c.rw, c.rh, { fit: c.fit as never })
        .png()
        .toBuffer()
        .then((b) => sharp(b).metadata());

      const predicted = effectiveOutputGeometry(c.w, c.h, c.rw, c.rh, c.fit as never);
      const label = `${c.w}x${c.h} -> ${c.rw ?? "-"}x${c.rh ?? "-"} fit=${c.fit}`;
      expect(predicted.width, `${label}: width under-estimated`).toBeGreaterThanOrEqual(
        actual.width!,
      );
      expect(predicted.height, `${label}: height under-estimated`).toBeGreaterThanOrEqual(
        actual.height!,
      );
      // And not wildly over: a cap that refuses legitimate work is its own bug.
      expect(predicted.width - actual.width!, `${label}: width over-estimated`).toBeLessThanOrEqual(1);
      expect(predicted.height - actual.height!, `${label}: height over-estimated`).toBeLessThanOrEqual(1);
    }
  });

  it("refuses when the source dimensions cannot be read", () => {
    // Used to fall back to the REQUESTED dimensions, which fails open: the
    // derived side is exactly what could not be computed. Reviewer-found.
    expect(() => effectiveOutputGeometry(0, 0, 100, 100, "cover")).toThrow(ImageLimitError);
    expect(() => effectiveOutputGeometry(Number.NaN, 100, 100, 100, "cover")).toThrow(
      ImageLimitError,
    );
  });

  it("POSITIVE CONTROL: width-only on a normal source still works", async () => {
    // 64x64 asked for width 400 resolves to 400x400 — well inside the caps.
    const b64 = (await tinyPng()).toString("base64");
    const r = (await run()({ base64: b64, target_width: 400 })) as {
      output: { width: number; height: number };
    };
    expect(r.output).toEqual(expect.objectContaining({ width: 400, height: 400 }));
  });

  it("cover, fill and contain resolve exactly to the requested box", () => {
    for (const fit of ["cover", "fill", "contain"] as const) {
      expect(effectiveOutputGeometry(320, 240, 100, 60, fit)).toEqual({ width: 100, height: 60 });
    }
  });

  it("inside never exceeds the requested box", () => {
    expect(effectiveOutputGeometry(320, 240, 100, 60, "inside")).toEqual({ width: 80, height: 60 });
  });
});

describe("data-URI prefixes are stripped once, by one function", () => {
  /**
   * Reviewer-found. The measurer stripped at the first comma while the caller
   * stripped only `data:image/\w+;base64,`. For a payload the caller did not
   * recognise, the measurer saw the short suffix and `Buffer.from` decoded the
   * whole string — prefix included, because those characters are themselves in
   * the base64 alphabet. A long prefix was measured as one byte.
   */
  it("the measurer and the executor agree on what gets decoded", () => {
    const payload = "A".repeat(1000);
    for (const uri of [
      `data:image/png;base64,${payload}`,
      `data:image/svg+xml;base64,${payload}`,
      `data:${"A".repeat(5000)},${payload}`,
      payload,
    ]) {
      const stripped = stripDataUriPrefix(uri);
      // What the size check measures is exactly what Buffer.from is handed.
      expect(decodedLengthOfBase64(stripped)).toBe(
        Buffer.from(stripped, "base64").byteLength,
      );
    }
  });

  it("an oversized payload behind an unrecognised data: prefix is still refused", () => {
    const oversized = "A".repeat(Math.ceil(((MAX_DECODED_IMAGE_BYTES + 1024 * 1024) * 4) / 3));
    const uri = `data:image/svg+xml;base64,${oversized}`;
    const stripped = stripDataUriPrefix(uri);
    expect(() => assertDecodedSizeWithinLimit(decodedLengthOfBase64(stripped), MAX_DECODED_IMAGE_BYTES)).toThrow(
      ImageLimitError,
    );
  });

  it("the estimate is an UPPER BOUND on what Buffer.from allocates", () => {
    // The invariant, stated directly, on the NORMALISED string that production
    // both measures and decodes. Two reviewer-supplied counterexamples broke
    // the previous version:
    //
    //   - whitespace: the measurer stripped it, the caller decoded the
    //     unstripped string, and Node sizes its backing store from the input
    //     LENGTH — so 6 MiB of spaces measured as 3 bytes and allocated ~4.7 MB;
    //   - padding: "A"*5592407 + "==" measured exactly at the limit and
    //     decoded to one byte more.
    const cases = [
      " ".repeat(6 * 1024 * 1024) + "AAAA",
      "A".repeat(5_592_407) + "==",
      "A".repeat(5_592_407) + "=",
      "QUJD",
      "",
      "AAAA," + "B".repeat(1000),
      "data:image/svg+xml;base64," + "C".repeat(1000),
    ];
    for (const raw of cases) {
      const normalised = normalizeBase64(raw);
      expect(
        decodedLengthOfBase64(normalised),
        `under-estimated for a ${raw.length}-char input`,
      ).toBeGreaterThanOrEqual(Buffer.from(normalised, "base64").byteLength);
    }
  });

  it("POSITIVE CONTROL: line-wrapping must not push a legal payload over the cap", async () => {
    // Standard base64 is wrapped at 76 characters, so this is ordinary input.
    //
    // It is also what makes the normalisation OBSERVABLE. The payload decodes
    // to just under the 4 MiB cap; wrapping adds ~1.3% newlines. If the
    // executor stripped only the data-URI prefix and left the newlines in, the
    // measurer would count them and refuse a legal image.
    //
    // The discriminator is WHICH error comes back. Correctly normalised, the
    // bytes clear the cap and reach sharp, which rejects them for what they
    // are — not an image. Un-normalised, the cap refuses them first. Both
    // throw; only one of them is the limit talking.
    // 8 KiB of slack, not 64 KiB. Line-wrapping at 76 adds only ~1.3%, so a
    // wider margin left the un-normalised estimate still under the cap and the
    // control did not discriminate — it passed under the mutation too.
    const decodedTarget = MAX_DECODED_IMAGE_BYTES - 8 * 1024;
    const raw = "A".repeat(Math.floor((decodedTarget * 4) / 3));
    const wrapped = raw.replace(/(.{76})/g, "$1\n");

    await expect(
      run()({ base64: wrapped, target_width: 32, target_height: 32 }),
    ).rejects.toThrow(/unsupported image format/i);
  });

  it("the EXECUTOR refuses an oversized payload padded with whitespace", async () => {
    // Would have passed before: measured tiny, allocated megabytes.
    const oversized = "A".repeat(Math.ceil(((MAX_DECODED_IMAGE_BYTES + 1024 * 1024) * 4) / 3));
    const padded = oversized.replace(/(.{76})/g, "$1\n");
    sharpCalls.mockClear();
    await expect(run()({ base64: padded, target_width: 100 })).rejects.toThrow(
      /must be .* or less once decoded/,
    );
    expect(sharpCalls, "whitespace-padded oversized bytes reached the decoder").not.toHaveBeenCalled();
  });

  it("never under-estimates a payload containing a comma", () => {
    // The specific shape that let the two-opinions bug through, and the one a
    // "strip at the first comma" regression reintroduces: a comma is not a
    // base64 character, so Buffer.from ignores it and decodes everything —
    // while a comma-stripping measurer would see only the first four bytes.
    const payload = "AAAA," + "B".repeat(200_000);
    expect(decodedLengthOfBase64(payload)).toBeGreaterThanOrEqual(
      Buffer.from(payload, "base64").byteLength,
    );
  });

  it("an oversized payload containing a comma is still refused", () => {
    const oversized = "AAAA," + "B".repeat(Math.ceil(((MAX_DECODED_IMAGE_BYTES + 1024 * 1024) * 4) / 3));
    const stripped = stripDataUriPrefix(oversized);
    expect(() => assertDecodedSizeWithinLimit(decodedLengthOfBase64(stripped), MAX_DECODED_IMAGE_BYTES)).toThrow(
      ImageLimitError,
    );
  });

  it("the EXECUTOR refuses an oversized payload behind an unrecognised prefix", async () => {
    // Drives the executor, not just the helper. The helper-only tests could
    // not catch a caller that stripped differently from the measurer.
    const oversized = "B".repeat(Math.ceil(((MAX_DECODED_IMAGE_BYTES + 1024 * 1024) * 4) / 3));
    await expect(
      run()({ base64: `data:image/svg+xml;base64,${oversized}`, target_width: 100 }),
    ).rejects.toThrow(/must be .* or less once decoded/);
  });

  it("never under-estimates: whitespace, padding and empty input", () => {
    for (const raw of ["", "QQ==", "QQ=", "QUJD", "QUJ\nD", "  QUJD  "]) {
      const est = decodedLengthOfBase64(raw);
      expect(est).toBeGreaterThanOrEqual(Buffer.from(raw.replace(/\s/g, ""), "base64").byteLength);
    }
  });
});

describe("the image_url path is bounded too", () => {
  // Otherwise it is simply the cheaper way in: it carries no body at all, so
  // the rail cap never sees it and the base64 limit above is decorative.
  it("refuses on a declared content-length over the limit, without reading", async () => {
    const res = streamingResponse(1024, MAX_DECODED_IMAGE_BYTES + 1);
    await expect(readBodyWithLimit(res, MAX_DECODED_IMAGE_BYTES)).rejects.toThrow(/'image_url' must be/);
  });

  it("aborts a stream that exceeds the limit even with no content-length", async () => {
    const res = streamingResponse(MAX_DECODED_IMAGE_BYTES + 2 * 1024 * 1024);
    await expect(readBodyWithLimit(res, MAX_DECODED_IMAGE_BYTES)).rejects.toThrow(/'image_url' must be/);
  });

  it("does not buffer materially more than the limit before aborting", async () => {
    // The property that makes this a limit rather than a report. Counts what
    // the reader actually pulled.
    let pulled = 0;
    const chunk = new Uint8Array(64 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        pulled += chunk.byteLength;
        ctrl.enqueue(chunk);
      },
    });
    await expect(readBodyWithLimit(new Response(body), MAX_DECODED_IMAGE_BYTES)).rejects.toThrow();
    expect(pulled).toBeLessThanOrEqual(MAX_DECODED_IMAGE_BYTES + 128 * 1024);
  });

  it("POSITIVE CONTROL: an under-limit body is returned intact", async () => {
    const png = await tinyPng();
    const out = await readBodyWithLimit(new Response(new Uint8Array(png)), MAX_DECODED_IMAGE_BYTES);
    expect(out.byteLength).toBe(png.byteLength);
  });

  /**
   * The tests above prove the HELPER bounds a response. They do not prove
   * `image-resize` uses it, and that gap was real: reverting the executor's
   * `readBodyWithLimit(response)` back to `Buffer.from(await
   * response.arrayBuffer())` left all 33 tests passing. Found by the mutation
   * run, not by review — a guard that is never wired in is indistinguishable
   * from no guard.
   *
   * These drive the executor's own `image_url` branch.
   */
  it("the EXECUTOR refuses an oversized image_url response", async () => {
    const res = streamingResponse(MAX_DECODED_IMAGE_BYTES + 2 * 1024 * 1024);
    safeFetchMock.mockResolvedValueOnce(res);

    await expect(
      run()({ image_url: "https://example.test/big.png", target_width: 100 }),
    ).rejects.toThrow(/'image_url' must be/);
  });

  it("and sharp is never constructed for an oversized image_url", async () => {
    safeFetchMock.mockResolvedValueOnce(
      streamingResponse(MAX_DECODED_IMAGE_BYTES + 2 * 1024 * 1024),
    );
    sharpCalls.mockClear();

    await expect(
      run()({ image_url: "https://example.test/big.png", target_width: 100 }),
    ).rejects.toThrow();
    expect(sharpCalls, "oversized fetched bytes reached the decoder").not.toHaveBeenCalled();
  });

  it("POSITIVE CONTROL: the executor still resizes an under-limit image_url", async () => {
    const png = await tinyPng();
    safeFetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array(png), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const r = (await run()({
      image_url: "https://example.test/ok.png",
      target_width: 32,
      target_height: 32,
    })) as { output: { width: number; height: number } };
    expect(r.output.width).toBe(32);
  });
});

describe("a refusal is the caller's fault, not the capability's", () => {
  /**
   * The quality floor is armed (quarantine below 70% on >=10 real calls). A
   * correct refusal counted as a capability failure would push `image-resize`
   * toward delisting for doing its job — the exact failure the taxonomy's own
   * comments describe. Verified rather than assumed.
   */
  it("every refusal message classifies as caller_input and does not count", async () => {
    // Messages are PROVOKED from the producing code, never hand-written here.
    // The previous version recreated the two URL messages as string literals,
    // so production wording could drift while this stayed green —
    // reviewer-found. Anything that reaches a caller as a refusal should be in
    // this list; if a new one is added and not covered, the count assertion
    // below fails and someone has to look.
    const messages: string[] = [];
    const capture = async (f: () => unknown) => {
      try {
        await f();
      } catch (e) {
        if (e instanceof ImageLimitError || (e as Error)?.message) {
          messages.push((e as Error).message);
        }
      }
    };

    const b64 = (await tinyPng()).toString("base64");

    // Requested-geometry refusals, both sides.
    await capture(() => assertOutputGeometryWithinLimit(-1, 10));
    await capture(() => assertOutputGeometryWithinLimit(10, -1));
    await capture(() => assertOutputGeometryWithinLimit(MAX_OUTPUT_DIMENSION + 1, 10));
    await capture(() => assertOutputGeometryWithinLimit(10, MAX_OUTPUT_DIMENSION + 1));
    await capture(() => assertOutputGeometryWithinLimit(MAX_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION));
    // Decoded size.
    await capture(() => assertDecodedSizeWithinLimit(MAX_DECODED_IMAGE_BYTES + 1, MAX_DECODED_IMAGE_BYTES));
    // Effective-geometry refusals, both sides and the area.
    await capture(() => assertEffectiveGeometryWithinLimit(MAX_OUTPUT_DIMENSION + 1, 10));
    await capture(() => assertEffectiveGeometryWithinLimit(10, MAX_OUTPUT_DIMENSION + 1));
    await capture(() =>
      assertEffectiveGeometryWithinLimit(MAX_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION),
    );
    // Unreadable source dimensions.
    await capture(() => effectiveOutputGeometry(0, 0, 100, 100, "cover"));
    // URL-path refusals, provoked through the real helper rather than quoted.
    await capture(() =>
      readBodyWithLimit(streamingResponse(1024, MAX_DECODED_IMAGE_BYTES + 1), MAX_DECODED_IMAGE_BYTES),
    );
    await capture(() =>
      readBodyWithLimit(streamingResponse(MAX_DECODED_IMAGE_BYTES + 2 * 1024 * 1024), MAX_DECODED_IMAGE_BYTES),
    );
    // Executor-level required-field refusals.
    await capture(() => run()({ target_width: 10 }));
    await capture(() => run()({ base64: b64 }));

    expect(messages.length, "a refusal path stopped throwing").toBe(14);

    const unclassified = messages.filter((m) => classifyTransactionFailure(m) !== "caller_input");
    expect(
      unclassified,
      "these refusals do not classify as caller_input: " + unclassified.join(" | "),
    ).toEqual([]);
    for (const m of messages) {
      expect(countsAgainstCapability(classifyTransactionFailure(m))).toBe(false);
    }
  });

  it("refusals throw rather than returning an output, so nothing settles", () => {
    // The executor contract: a thrown error means no output object, and the
    // /v1 and x402 paths both settle only after a successful execution
    // (x402-gateway-v2 verifies, executes, then settles; do.ts is
    // verify -> execute -> settle per DEC-14). A refusal cannot produce a
    // charge because it cannot produce a success.
    expect(() => assertOutputGeometryWithinLimit(100_000, 100_000)).toThrow(ImageLimitError);
  });
});
