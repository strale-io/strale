/**
 * `image-resize` must refuse an unsupported `format` rather than return bytes
 * whose encoding contradicts the format it reports.
 *
 * ## The defect
 *
 * Reviewer-found during the x402 resource-safety work, and left out of that PR
 * deliberately because it is a correctness bug rather than a containment one.
 *
 * `format` was read with a CAST:
 *
 *     const format = ((input.format as string) ?? "png").toLowerCase()
 *       as "png" | "jpeg" | "webp";
 *
 * A cast asserts a type without checking one. Anything that was not `"jpeg"`
 * or `"webp"` fell through to the PNG branch, so `format: "gif"` produced:
 *
 *     { base64: <PNG bytes>, content_type: "image/png", format: "gif" }
 *
 * A 200 whose own fields contradict each other. A caller trusting
 * `output.format` to choose a file extension or a decoder gets it wrong, and
 * nothing anywhere reports an error — which is worse than a failure, because a
 * failure is visible.
 *
 * `fit` and `quality` carried the identical pattern on adjacent lines. They do
 * not produce a contradictory success — sharp rejects them — but it rejects
 * them with its own internal text, "Expected valid fit for fit but received
 * bogus of type string", which reaches the caller as a capability failure
 * rather than a validation refusal, and only after the decoder is constructed.
 * Same cause, same three lines, fixed together.
 *
 * ## Fail-before
 *
 * Against the cast, `format: "gif"` RESOLVES with PNG bytes, so the rejection
 * assertions fail and the contradiction assertion fails. Verified both ways.
 */

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import "./image-resize.js";
import { getExecutor } from "./index.js";
import {
  IMAGE_FORMATS,
  FIT_MODES,
  assertEnum,
  assertQuality,
  ResourceLimitError,
} from "../lib/resource-limits.js";
import {
  classifyTransactionFailure,
  countsAgainstCapability,
} from "../lib/transaction-failure-taxonomy.js";

const run = () => getExecutor("image-resize")!;

async function source(): Promise<string> {
  const buf = await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 200, g: 60, b: 30 } },
  })
    .png()
    .toBuffer();
  return buf.toString("base64");
}

type Out = {
  output: { base64: string; content_type: string; format: string; width: number; height: number };
};

describe("an unsupported format is refused, not silently re-encoded", () => {
  it("refuses format=gif instead of returning PNG bytes labelled gif", async () => {
    const base64 = await source();
    await expect(
      run()({ base64, target_width: 50, target_height: 50, format: "gif" }),
    ).rejects.toThrow(/'format' must be one of: png, jpeg, webp/);
  });

  it("refuses every other plausible-but-unsupported encoding", async () => {
    const base64 = await source();
    for (const format of ["gif", "avif", "tiff", "bmp", "svg", "heic", "pdf"]) {
      await expect(
        run()({ base64, target_width: 20, target_height: 20, format }),
        `accepted format=${format}`,
      ).rejects.toThrow(ResourceLimitError);
    }
  });

  it("refuses a non-string format rather than coercing it", async () => {
    const base64 = await source();
    for (const format of [1, true, {}, []]) {
      await expect(
        run()({ base64, target_width: 20, target_height: 20, format }),
        `accepted format=${JSON.stringify(format)}`,
      ).rejects.toThrow(/'format' must be one of/);
    }
  });
});

describe("what the response says about itself is true", () => {
  // The property the defect violated: `output.format` and `content_type` must
  // describe the bytes actually returned. Decoded rather than compared against
  // the request, so an executor that echoed the input would fail here.
  for (const format of IMAGE_FORMATS) {
    it(`format=${format} returns ${format} bytes, and says so`, async () => {
      const base64 = await source();
      const r = (await run()({
        base64,
        target_width: 50,
        target_height: 50,
        format,
      })) as Out;

      const decoded = await sharp(Buffer.from(r.output.base64, "base64")).metadata();
      expect(decoded.format, "the bytes are not the format claimed").toBe(format);
      expect(r.output.format).toBe(format);
      expect(r.output.content_type).toBe(
        format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png",
      );
    });
  }

  it("omitting format still defaults to png, and the bytes are png", async () => {
    const base64 = await source();
    const r = (await run()({ base64, target_width: 40, target_height: 40 })) as Out;
    expect(r.output.format).toBe("png");
    const decoded = await sharp(Buffer.from(r.output.base64, "base64")).metadata();
    expect(decoded.format).toBe("png");
  });

  it("accepts a differently-cased format, because that is the same request", async () => {
    const base64 = await source();
    const r = (await run()({ base64, target_width: 40, target_height: 40, format: "JPEG" })) as Out;
    expect(r.output.format).toBe("jpeg");
    expect(r.output.content_type).toBe("image/jpeg");
  });
});

describe("fit and quality are validated on the same terms", () => {
  it("refuses an unsupported fit before the decoder is built", async () => {
    const base64 = await source();
    await expect(
      run()({ base64, target_width: 20, target_height: 20, fit: "squish" }),
    ).rejects.toThrow(/'fit' must be one of: cover, contain, fill, inside, outside/);
  });

  it("does not leak sharp's internal wording for a bad fit", async () => {
    // Pre-fix this surfaced "Expected valid fit for fit but received squish of
    // type string" — sharp's message, reaching the caller as a capability
    // failure rather than a refusal.
    const base64 = await source();
    await expect(
      run()({ base64, target_width: 20, target_height: 20, fit: "squish" }),
    ).rejects.not.toThrow(/Expected valid fit/);
  });

  it("refuses a quality outside 1-100", async () => {
    const base64 = await source();
    for (const quality of [0, 101, -5, 1.5]) {
      await expect(
        run()({ base64, target_width: 20, target_height: 20, format: "jpeg", quality }),
        `accepted quality=${quality}`,
      ).rejects.toThrow(/'quality' must be a whole number between 1 and 100/);
    }
  });

  it("POSITIVE CONTROL: every supported fit still works", async () => {
    const base64 = await source();
    for (const fit of FIT_MODES) {
      const r = (await run()({ base64, target_width: 100, target_height: 60, fit })) as Out;
      expect(r.output.width, `fit=${fit} produced nothing`).toBeGreaterThan(0);
    }
  });

  it("POSITIVE CONTROL: boundary qualities are accepted", async () => {
    const base64 = await source();
    for (const quality of [1, 100]) {
      const r = (await run()({
        base64,
        target_width: 20,
        target_height: 20,
        format: "jpeg",
        quality,
      })) as Out;
      expect(r.output.format).toBe("jpeg");
    }
  });
});

describe("the validator itself", () => {
  it("falls back only for absent values, never for wrong ones", () => {
    expect(assertEnum(undefined, IMAGE_FORMATS, "format", "png")).toBe("png");
    expect(assertEnum(null, IMAGE_FORMATS, "format", "png")).toBe("png");
    expect(assertEnum("", IMAGE_FORMATS, "format", "png")).toBe("png");
    expect(() => assertEnum("gif", IMAGE_FORMATS, "format", "png")).toThrow(ResourceLimitError);
  });

  it("normalises case and surrounding whitespace", () => {
    expect(assertEnum("  WebP ", IMAGE_FORMATS, "format", "png")).toBe("webp");
  });

  it("names the offending value in the message, for a caller who has to fix it", () => {
    expect(() => assertEnum("gif", IMAGE_FORMATS, "format", "png")).toThrow(/"gif"/);
  });

  it("accepts an absent quality and rejects a non-numeric one", () => {
    expect(assertQuality(undefined)).toBe(80);
    expect(() => assertQuality("high")).toThrow(ResourceLimitError);
  });
});

describe("these refusals are the caller's fault, not the capability's", () => {
  // The quality floor is armed. A capability that refuses bad input correctly
  // must not be pushed toward quarantine for doing so.
  it("every message classifies as caller_input and does not count", () => {
    const messages: string[] = [];
    const capture = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        messages.push((e as Error).message);
      }
    };
    capture(() => assertEnum("gif", IMAGE_FORMATS, "format", "png"));
    capture(() => assertEnum("squish", FIT_MODES, "fit", "cover"));
    capture(() => assertEnum(7, IMAGE_FORMATS, "format", "png"));
    capture(() => assertQuality(0));
    capture(() => assertQuality("high"));
    expect(messages.length).toBe(5);

    for (const m of messages) {
      const cls = classifyTransactionFailure(m);
      expect(cls, `"${m}" classified as ${cls}`).toBe("caller_input");
      expect(countsAgainstCapability(cls)).toBe(false);
    }
  });
});
