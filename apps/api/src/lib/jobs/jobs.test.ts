import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("../url-validator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../url-validator.js")>();
  return {
    ...actual,
    validateUrl: async (u: string) => {
      if (new URL(u).hostname === "169.254.169.254") throw new actual.UrlValidationError("Hostname targets a restricted address.");
    },
  };
});

import {
  FileOutputError,
  MAX_FILE_BYTES,
  MAX_FILES_PER_JOB,
  MAX_TOTAL_FILE_BYTES,
  manifestOf,
  prepareFiles,
  sanitizeFileName,
  signFileUrl,
  verifyFileUrl,
} from "./files.js";
import { MAX_ATTEMPTS, RETRY_DELAYS_SECONDS, checkCallbackUrl, signCallback, webhookSecretFor } from "./callbacks.js";
import { PII_RETENTION_DAYS } from "../data-retention.js";

describe("prepareFiles", () => {
  it("returns nothing when the executor returned no files", () => {
    expect(prepareFiles(undefined)).toEqual([]);
    expect(prepareFiles(null)).toEqual([]);
  });

  it("hashes, sizes and sanitises each file", () => {
    const [f] = prepareFiles([{ name: "../../etc/pass wd", content_type: "Text/Plain", data: Buffer.from("abc") }]);
    expect(f!.name).toBe("pass_wd");
    expect(f!.content_type).toBe("text/plain");
    expect(f!.size_bytes).toBe(3);
    expect(f!.sha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(manifestOf([f!])[0]).not.toHaveProperty("data");
  });

  it("falls back to octet-stream for a malformed content type", () => {
    const [f] = prepareFiles([{ name: "x", content_type: "text/html\r\nX-Evil: 1", data: Buffer.from("a") }]);
    expect(f!.content_type).toBe("application/octet-stream");
  });

  it("refuses over-cap results", () => {
    expect(() => prepareFiles([{ name: "a", content_type: "a/b", data: Buffer.alloc(MAX_FILE_BYTES + 1) }])).toThrow(FileOutputError);
    const many = Array.from({ length: MAX_FILES_PER_JOB + 1 }, () => ({ name: "a", content_type: "a/b", data: Buffer.from("x") }));
    expect(() => prepareFiles(many)).toThrow(FileOutputError);
    const chunk = Buffer.alloc(MAX_FILE_BYTES);
    const total = Array.from({ length: Math.ceil(MAX_TOTAL_FILE_BYTES / MAX_FILE_BYTES) + 1 }, () => ({ name: "a", content_type: "a/b", data: chunk }));
    expect(() => prepareFiles(total)).toThrow(FileOutputError);
    expect(() => prepareFiles([{ name: "a", content_type: "a/b", data: "not bytes" }])).toThrow(FileOutputError);
    expect(() => prepareFiles("nope")).toThrow(FileOutputError);
  });

  it("sanitizeFileName never returns an empty or dot-led name", () => {
    expect(sanitizeFileName("")).toBe("file");
    expect(sanitizeFileName("..")).toBe("file");
    expect(sanitizeFileName(".env")).toBe("env");
  });
});

describe("signed file URLs", () => {
  const id = "11111111-2222-3333-4444-555555555555";

  it("round-trips and expires", () => {
    const now = 1_800_000_000_000;
    const { url } = signFileUrl(id, now, 60);
    const q = new URL(`https://x${url}`).searchParams;
    expect(verifyFileUrl(id, q.get("expires")!, q.get("sig")!, now)).toBe("ok");
    expect(verifyFileUrl(id, q.get("expires")!, q.get("sig")!, now + 61_000)).toBe("expired");
  });

  it("binds the signature to the file and the expiry", () => {
    const now = Date.now();
    const q = new URL(`https://x${signFileUrl(id, now).url}`).searchParams;
    expect(verifyFileUrl("11111111-2222-3333-4444-555555555556", q.get("expires")!, q.get("sig")!, now)).toBe("invalid");
    expect(verifyFileUrl(id, String(Number(q.get("expires")) + 3600), q.get("sig")!, now)).toBe("invalid");
    expect(verifyFileUrl(id, undefined, q.get("sig")!, now)).toBe("invalid");
    expect(verifyFileUrl(id, q.get("expires")!, "zz", now)).toBe("invalid");
  });

  it("never reports 'expired' for a forged link", () => {
    expect(verifyFileUrl(id, "1", "0".repeat(64), Date.now())).toBe("invalid");
  });
});

describe("callbacks", () => {
  it("signs t.body with HMAC-SHA256 under the caller's secret", () => {
    const secret = webhookSecretFor("user-a");
    expect(secret).toMatch(/^whsec_[0-9a-f]{64}$/);
    expect(webhookSecretFor("user-b")).not.toBe(secret);
    const header = signCallback(secret, 1700000000, '{"a":1}');
    const v1 = createHmac("sha256", secret).update('1700000000.{"a":1}').digest("hex");
    expect(header).toBe(`t=1700000000,v1=${v1}`);
  });

  it("accepts only public https URLs", async () => {
    expect(await checkCallbackUrl("https://hooks.example.com/x")).toBeNull();
    expect(await checkCallbackUrl("http://hooks.example.com/x")).toMatch(/https/);
    expect(await checkCallbackUrl("https://user:pw@hooks.example.com/x")).toMatch(/credentials/);
    expect(await checkCallbackUrl("https://169.254.169.254/latest")).toMatch(/not allowed/);
    expect(await checkCallbackUrl("not a url")).toMatch(/valid URL/);
    expect(await checkCallbackUrl(42)).toMatch(/string/);
    expect(await checkCallbackUrl(`https://a.example/${"x".repeat(2100)}`)).toMatch(/at most/);
  });

  it("is bounded: a delay for every retry, and the last one under a day", () => {
    expect(RETRY_DELAYS_SECONDS.length).toBe(MAX_ATTEMPTS - 1);
    expect(RETRY_DELAYS_SECONDS.reduce((a, b) => a + b, 0)).toBeLessThan(24 * 3600);
  });
});

describe("retention", () => {
  it("files follow the content window", () => {
    expect(PII_RETENTION_DAYS).toBe(90);
  });
});
