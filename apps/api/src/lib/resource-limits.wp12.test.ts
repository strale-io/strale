/**
 * WP12 batch 3 (CR-12): the helpers added to resource-limits.ts for the pixel
 * cap, the socket sink and the registry-record phrase. The capability-level
 * tests (image-resize.pixel-cap, whois-response-cap, registry-body-caps) prove
 * the wiring; these pin the helpers' own edges.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_INPUT_PIXELS,
  ResourceLimitError,
  asPixelLimitRefusal,
  assertInputPixelsWithinLimit,
  createCappedTextSink,
  readJsonWithLimit,
} from "./resource-limits.js";
import { IMAGE_MAX_INPUT_PIXELS } from "../capabilities/lib/ocr/engine.js";
import { streamingResponse } from "../capabilities/lib/streaming-response-testutil.js";

describe("assertInputPixelsWithinLimit", () => {
  it("accepts exactly the cap and refuses one pixel row more", () => {
    expect(() => assertInputPixelsWithinLimit(10_000, 6_000)).not.toThrow();
    expect(() => assertInputPixelsWithinLimit(10_000, 6_001)).toThrow(ResourceLimitError);
  });

  it("names the field and the received size", () => {
    expect(() => assertInputPixelsWithinLimit(9_000, 9_000, "image_url")).toThrow(
      "'image_url' must be an image of 60 megapixels or less (received 9000x9000, 81.0 megapixels).",
    );
  });

  it("leaves a header with no dimensions to the decoder's own limit", () => {
    expect(() => assertInputPixelsWithinLimit(undefined, 99_999)).not.toThrow();
    expect(() => assertInputPixelsWithinLimit(0, 0)).not.toThrow();
  });

  it("is the same number OCR decodes under", () => {
    expect(IMAGE_MAX_INPUT_PIXELS).toBe(MAX_INPUT_PIXELS);
  });
});

describe("asPixelLimitRefusal", () => {
  it("turns sharp's pixel-limit error into the repo's refusal", () => {
    const out = asPixelLimitRefusal(new Error("Input image exceeds pixel limit"), "url");
    expect(out).toBeInstanceOf(ResourceLimitError);
    expect((out as Error).message).toBe("'url' must be an image of 60 megapixels or less.");
  });

  it("returns any other error untouched", () => {
    const other = new Error("Input buffer contains unsupported image format");
    expect(asPixelLimitRefusal(other)).toBe(other);
    expect(asPixelLimitRefusal("not an error")).toBe("not an error");
  });
});

describe("createCappedTextSink", () => {
  it("keeps everything under the cap and reports not full", () => {
    const sink = createCappedTextSink(10);
    expect(sink.push("abc")).toBe(false);
    expect(sink.push(Buffer.from("def"))).toBe(false);
    expect(sink.text()).toBe("abcdef");
    expect(sink.truncated).toBe(false);
  });

  it("keeps exactly the prefix that fits and reports full", () => {
    const sink = createCappedTextSink(10);
    sink.push("0123456");
    expect(sink.push("789ABCDEF")).toBe(true);
    expect(sink.text()).toBe("0123456789");
    expect(sink.truncated).toBe(true);
    // Later chunks are ignored, not appended.
    expect(sink.push("more")).toBe(true);
    expect(sink.text()).toBe("0123456789");
  });

  it("decodes once at the end, so a character split across chunks survives", () => {
    const bytes = Buffer.from("é"); // 2 bytes
    const sink = createCappedTextSink(100);
    sink.push(bytes.subarray(0, 1));
    sink.push(bytes.subarray(1));
    expect(sink.text()).toBe("é");
  });

  it("a cap that lands mid-character yields a replacement character, not a throw", () => {
    const sink = createCappedTextSink(1);
    expect(sink.push(Buffer.from("é"))).toBe(true);
    expect(sink.text()).toBe("�");
  });
});

describe("readJsonWithLimit entity", () => {
  it("defaults to the endpoint phrase", async () => {
    const { response } = streamingResponse(2 * 1024 * 1024);
    await expect(readJsonWithLimit(response, 1024 * 1024)).rejects.toThrow(
      "'url' must be an endpoint whose response is 1.0MB or less.",
    );
  });

  it("takes the caller's phrase", async () => {
    const { response } = streamingResponse(2 * 1024 * 1024);
    await expect(readJsonWithLimit(response, 1024 * 1024, "package", "a registry record of")).rejects.toThrow(
      "'package' must be a registry record of 1.0MB or less.",
    );
  });
});
