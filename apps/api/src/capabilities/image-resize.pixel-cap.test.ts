/**
 * WP12 batch 3 (CR-12): `image-resize` must bound the SOURCE image's pixel
 * count, from the header, before the decoder runs.
 *
 * ## The gap this plants
 *
 * `image-resize` caps the source's bytes (4 MiB) and the requested OUTPUT
 * geometry (25 MP), but nothing bounded the source's own width x height.
 * sharp's built-in `limitInputPixels` default is 268 megapixels, and 4 MiB of
 * deflate is enough for a solid image of several hundred megapixels: the
 * fixture below is a ~100 KB file that declares 81 megapixels, and another is
 * a 100-byte header declaring 400. A caller who wants a small thumbnail of
 * one of these buys a full-size decode.
 *
 * Measured against sharp 0.35.3 / libvips 8.18.3, 2026-11-05: a 12,000 x
 * 12,000 interlaced PNG of 464 KB takes 2.5 s to resize to 100 x 100; a
 * non-interlaced one of the same size decodes in 66 ms because libvips
 * streams it. The cap is a bound on the work a small file can buy, not a
 * claim that every file at the limit is slow.
 *
 * ## What is asserted
 *
 * The refusal is the repo's own `ResourceLimitError` (caller_input, floor
 * exempt), raised from the header, in the same shape as the output-geometry
 * refusals. Before the guard the 81 MP file decodes successfully and the
 * 400 MP file fails with sharp's own text ("Input image exceeds pixel
 * limit"), which classifies as a capability failure.
 */

import { describe, it, expect } from "vitest";
import { createDeflate, crc32 } from "node:zlib";
import { once } from "node:events";

import "./image-resize.js";
import { getExecutor } from "./index.js";
import { ResourceLimitError } from "../lib/resource-limits.js";
import { classifyTransactionFailure, countsAgainstCapability } from "../lib/transaction-failure-taxonomy.js";

const run = () => getExecutor("image-resize")!;

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * A grayscale 8-bit PNG declaring width x height. With `fill` the IDAT is a
 * real deflate stream of zero rows (a decodable solid image, about 1/1000 of
 * its raw size), written a row at a time so the raw image is never resident.
 * Without it the IDAT is empty: only the header is meaningful.
 */
async function png(width: number, height: number, fill: boolean): Promise<Buffer> {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  const parts: Buffer[] = [];
  if (fill) {
    const z = createDeflate({ level: 9 });
    z.on("data", (b: Buffer) => parts.push(b));
    const row = Buffer.alloc(1 + width);
    for (let y = 0; y < height; y++) z.write(row);
    z.end();
    await once(z, "end");
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", Buffer.concat(parts)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("image-resize bounds the source image's pixel count from its header", () => {
  it("POSITIVE CONTROL: a 49 MP source (under the cap) is still resized", async () => {
    const src = await png(7000, 7000, true);
    expect(src.length).toBeLessThan(4 * 1024 * 1024);
    const r = (await run()({ base64: src.toString("base64"), target_width: 100, target_height: 100 })) as {
      output: { width: number; height: number };
    };
    expect(r.output.width).toBe(100);
    expect(r.output.height).toBe(100);
  }, 60_000);

  it("refuses an 81 MP source that a ~100 KB file declares, before decoding it", async () => {
    const src = await png(9000, 9000, true);
    expect(src.length).toBeLessThan(4 * 1024 * 1024);
    const err = await run()({ base64: src.toString("base64"), target_width: 100, target_height: 100 }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err, "an 81 megapixel source was decoded").toBeInstanceOf(ResourceLimitError);
    expect((err as Error).message).toMatch(/'base64' must be \d+(\.\d+)? megapixels or less/);
  }, 60_000);

  it("refuses a header that declares 400 MP with a structured refusal, not sharp's own text", async () => {
    const src = await png(20_000, 20_000, false);
    expect(src.length).toBeLessThan(200);
    const err = await run()({ base64: src.toString("base64"), target_width: 100, target_height: 100 }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ResourceLimitError);
    expect((err as Error).message).not.toMatch(/exceeds pixel limit/i);
  });

  it("the refusal is the caller's: it does not count against the capability", async () => {
    const src = await png(9000, 9000, true);
    const err = (await run()({ base64: src.toString("base64"), target_width: 100 }).then(
      () => null,
      (e: unknown) => e,
    )) as Error | null;
    expect(err, "an 81 megapixel source was decoded").not.toBeNull();
    const cls = classifyTransactionFailure(err!.message);
    expect(countsAgainstCapability(cls), "a pixel-cap refusal must be floor exempt").toBe(false);
  });
});
