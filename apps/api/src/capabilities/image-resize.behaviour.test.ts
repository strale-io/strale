/**
 * `image-resize` behaviour across the sharp 0.34.5 → 0.35.3 upgrade.
 *
 * ## Why this file did not exist before, and why it does now
 *
 * VERIFY-DEP / WP13 triage, 2026-08-25. `sharp@0.34.5` carries inherited
 * libvips CVEs (2026-33327, -33328, -35590, -35591) — memory-safety issues in
 * image decoders. `image-resize.ts:41` calls `sharp(imageBuffer)` on bytes the
 * caller supplies, either by URL or base64, and the capability is
 * `x402_enabled`, so **no signup and no API key are required**: payment is the
 * auth. That is the worst exposure profile in the whole scan.
 *
 * The fix is `sharp@0.35.3`, which is a semver-major bump AND a change of
 * native artifact (libvips 8.17.3 → 8.18.3). Before this file, the capability
 * had no behavioural coverage at all — `ssrf-bucket-a.test.ts` exercises its
 * URL-fetch path for SSRF, and nothing checked that a resize produces the
 * dimensions, format, or metadata it claims. Upgrading a native image decoder
 * with no output assertions is how silent drift ships.
 *
 * ## What was measured before writing this
 *
 * Both versions were run side by side, in separate processes (two sharp
 * natives cannot coexist in one process — the second `dlopen` fails), over 19
 * cases: all five `fit` modes × three output formats, plus width-only,
 * height-only, a 400×400 upscale at quality 50, and a 1×1 degenerate case.
 *
 *   - **Zero drift** in width, height, format, or channel count. 19 of 19.
 *   - Identical error text on undecodable input:
 *     `Input buffer contains unsupported image format`.
 *   - Three PNG cases differ by exactly one byte (298→297, 393→392, 179→178).
 *     PNG encoder output, not a behaviour change — but `size_bytes` is in the
 *     response, so it is recorded rather than glossed.
 *
 * These tests pin the properties that were verified equal, so a future sharp
 * bump has to prove the same thing rather than being taken on trust. They
 * deliberately do NOT pin byte sizes: that would fail on every encoder
 * revision while proving nothing about correctness.
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import "./image-resize.js";
import { getExecutor } from "./index.js";

const run = () => getExecutor("image-resize")!;

type ResizeOutput = {
  output: {
    base64: string;
    content_type: string;
    width: number;
    height: number;
    size_bytes: number;
    format: string;
  };
};

/** A deterministic source image. Built by the same sharp under test, so no fixture can drift. */
async function sourcePng(width = 320, height = 240): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 60, b: 30 } },
  })
    .png()
    .toBuffer();
}

describe("image-resize: the native decoder is the one we think it is", () => {
  it("runs a libvips at or above the version that carries the CVE fixes", () => {
    // The whole point of the upgrade. sharp's own version is not enough —
    // the CVEs are in libvips, which ships as a separate prebuilt artifact.
    const [maj, min] = sharp.versions.vips.split(".").map(Number);
    const atLeast8_18 = maj! > 8 || (maj === 8 && min! >= 18);
    expect(atLeast8_18, `libvips ${sharp.versions.vips} predates the fixes`).toBe(true);
  });
});

describe("image-resize: fit modes produce the geometry they claim", () => {
  // Measured identical on 0.34.5 and 0.35.3. Source is 320x240 (4:3),
  // requested 100x60 (5:3), so each fit resolves differently — which is what
  // makes these discriminating rather than five copies of the same assertion.
  const cases: Array<{ fit: string; width: number; height: number }> = [
    { fit: "cover", width: 100, height: 60 },
    { fit: "contain", width: 100, height: 60 },
    { fit: "fill", width: 100, height: 60 },
    { fit: "inside", width: 80, height: 60 }, // preserves aspect, fits within
    { fit: "outside", width: 100, height: 75 }, // preserves aspect, covers
  ];

  for (const c of cases) {
    it(`fit=${c.fit} yields ${c.width}x${c.height}`, async () => {
      const base64 = (await sourcePng()).toString("base64");
      const r = (await run()({
        base64,
        target_width: 100,
        target_height: 60,
        fit: c.fit,
        format: "png",
      })) as ResizeOutput;

      expect(r.output.width).toBe(c.width);
      expect(r.output.height).toBe(c.height);
    });
  }

  it("width-only preserves aspect ratio", async () => {
    const base64 = (await sourcePng()).toString("base64");
    const r = (await run()({ base64, target_width: 120, format: "png" })) as ResizeOutput;
    expect(r.output.width).toBe(120);
    expect(r.output.height).toBe(90); // 320x240 -> 4:3
  });

  it("height-only preserves aspect ratio", async () => {
    const base64 = (await sourcePng()).toString("base64");
    const r = (await run()({ base64, target_height: 90, format: "jpeg" })) as ResizeOutput;
    expect(r.output.width).toBe(120);
    expect(r.output.height).toBe(90);
  });
});

describe("image-resize: output formats and their declared metadata", () => {
  const formats: Array<{ format: string; mime: string }> = [
    { format: "png", mime: "image/png" },
    { format: "jpeg", mime: "image/jpeg" },
    { format: "webp", mime: "image/webp" },
  ];

  for (const f of formats) {
    it(`${f.format} declares ${f.mime} and really is ${f.format}`, async () => {
      const base64 = (await sourcePng()).toString("base64");
      const r = (await run()({
        base64,
        target_width: 100,
        target_height: 60,
        format: f.format,
      })) as ResizeOutput;

      expect(r.output.format).toBe(f.format);
      expect(r.output.content_type).toBe(f.mime);

      // The declared content type must match the actual bytes. Checking the
      // returned field against itself would pass on any encoder regression.
      const decoded = await sharp(Buffer.from(r.output.base64, "base64")).metadata();
      expect(decoded.format).toBe(f.format);
      expect(decoded.width).toBe(r.output.width);
      expect(decoded.height).toBe(r.output.height);
    });
  }

  it("size_bytes matches the payload actually returned", async () => {
    const base64 = (await sourcePng()).toString("base64");
    const r = (await run()({
      base64,
      target_width: 50,
      target_height: 50,
      format: "png",
    })) as ResizeOutput;
    expect(r.output.size_bytes).toBe(Buffer.from(r.output.base64, "base64").length);
  });
});

describe("image-resize: both input paths", () => {
  it("accepts a bare base64 payload", async () => {
    const base64 = (await sourcePng()).toString("base64");
    const r = (await run()({ base64, target_width: 50, target_height: 50 })) as ResizeOutput;
    expect(r.output.width).toBe(50);
    expect(r.output.height).toBe(50);
  });

  it("accepts a data: URI and strips the prefix", async () => {
    const base64 = (await sourcePng()).toString("base64");
    const r = (await run()({
      base64: `data:image/png;base64,${base64}`,
      target_width: 50,
      target_height: 50,
    })) as ResizeOutput;
    expect(r.output.width).toBe(50);
  });

  it("fetches image_url through safeFetch and resizes the response", async () => {
    // The URL path, stubbed at fetch so the test stays hermetic. safeFetch's
    // own SSRF behaviour is covered by ssrf-bucket-a.test.ts; what matters
    // here is that fetched bytes reach the decoder and come back resized.
    const png = await sourcePng();
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array(png), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      })) as typeof fetch;
    try {
      const r = (await run()({
        image_url: "https://example.com/a.png",
        target_width: 64,
        target_height: 64,
      })) as ResizeOutput;
      expect(r.output.width).toBe(64);
      expect(r.output.height).toBe(64);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("image-resize: refusals", () => {
  it("refuses undecodable bytes with a stable message", async () => {
    // Identical text on 0.34.5 and 0.35.3 — verified before the upgrade,
    // because this string reaches the caller through sanitizeFailureReason.
    const base64 = Buffer.from("this is definitely not an image").toString("base64");
    await expect(
      run()({ base64, target_width: 10, target_height: 10 }),
    ).rejects.toThrow(/unsupported image format/i);
  });

  it("requires an input", async () => {
    await expect(run()({ target_width: 10 })).rejects.toThrow(
      /'image_url' or 'base64' is required/,
    );
  });

  it("requires a target dimension", async () => {
    const base64 = (await sourcePng()).toString("base64");
    await expect(run()({ base64 })).rejects.toThrow(
      /'target_width' or 'target_height' is required/,
    );
  });
});
