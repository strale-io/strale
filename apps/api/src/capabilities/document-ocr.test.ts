import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const safeFetch = vi.fn();
vi.mock("../lib/safe-fetch.js", () => ({ safeFetch: (...a: unknown[]) => safeFetch(...a) }));

const { getDirectExecutor } = await import("./index.js");
await import("./document-ocr.js");
const { parseLanguages, isPdf, MAX_PAGES_PER_CALL } = await import("./document-ocr.js");
const engine = await import("./lib/ocr/engine.js");
const exec = getDirectExecutor("document-ocr")!;

const FIXTURE = resolve(import.meta.dirname, "lib/ocr/fixtures/riksdagen-mot-1975-36.pdf");
const fixtureB64 = () => readFileSync(FIXTURE).toString("base64");

function hasBinaries(): boolean {
  try {
    execFileSync("tesseract", ["--version"], { stdio: "ignore" });
    execFileSync("pdfinfo", ["-v"], { stdio: "ignore" });
    const langs = execFileSync("tesseract", ["--list-langs"]).toString();
    return langs.includes("swe") && langs.includes("eng");
  } catch {
    return false;
  }
}

describe("document-ocr input validation", () => {
  it("refuses before fetching anything", async () => {
    await expect(exec({})).rejects.toThrow(/exactly one/);
    await expect(exec({ url: "https://a.example/x.pdf", base64: "AAAA" })).rejects.toThrow(/exactly one/);
    await expect(exec({ url: "https://a.example/x.pdf", max_pages: MAX_PAGES_PER_CALL + 1 })).rejects.toThrow(/'max_pages' must be/);
    await expect(exec({ url: "https://a.example/x.pdf", first_page: 0 })).rejects.toThrow(/'first_page' must be/);
    await expect(exec({ url: "https://a.example/x.pdf", languages: "klingon" })).rejects.toThrow(/'languages' must be/);
    await expect(exec({ url: "https://a.example/x.pdf", output_file: "docx" })).rejects.toThrow(/'output_file' must be/);
    await expect(exec({ image_urls: [] })).rejects.toThrow(/'image_urls' must be/);
    await expect(exec({ image_urls: ["https://a.example/1.png"], first_page: 2 })).rejects.toThrow(/'first_page' must be at most 1/);
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("parses languages as a list or a plus-joined string, at most three", () => {
    expect(parseLanguages(undefined)).toEqual(["eng", "swe"]);
    expect(parseLanguages("deu+fra")).toEqual(["deu", "fra"]);
    expect(parseLanguages(["FIN", "swe", "swe"])).toEqual(["fin", "swe"]);
    expect(() => parseLanguages("eng+swe+deu+fra")).toThrow(/1 to 3/);
    expect(() => parseLanguages(["eng", "osd"])).toThrow(/'languages' must be/);
  });

  it("detects a PDF by its header, not its name", () => {
    expect(isPdf(Buffer.from("%PDF-1.4\n"))).toBe(true);
    expect(isPdf(Buffer.concat([Buffer.alloc(100, 32), Buffer.from("%PDF-1.7")]))).toBe(true);
    expect(isPdf(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });
});

describe("OCR engine parsing", () => {
  it("reads the page count, and refuses output without one", () => {
    expect(engine.parsePdfInfo("Title: x\nPages:           18\nEncrypted:       no\n")).toBe(18);
    expect(() => engine.parsePdfInfo("garbage")).toThrow(/page count/);
  });

  it("averages word confidence and ignores non-word rows", () => {
    const head = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
    const tsv = [head, "1\t1\t0\t0\t0\t0\t0\t0\t10\t10\t-1\t", "5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t90\tHej", "5\t1\t1\t1\t1\t2\t0\t0\t1\t1\t70\tvärld", "5\t1\t1\t1\t1\t3\t0\t0\t1\t1\t95\t "].join("\n");
    expect(engine.parseTsv(tsv)).toEqual({ mean_confidence: 80, word_count: 2 });
    expect(engine.parseTsv(head)).toEqual({ mean_confidence: null, word_count: 0 });
  });

  it("accepts an owner-password PDF; only a PDF that fails to open is refused", () => {
    expect(engine.parsePdfInfo("Pages:          2\nEncrypted:      yes (print:yes copy:no change:no addNotes:no)\n")).toBe(2);
  });

  it("bounds the queue: one document waits behind the running one", async () => {
    const far = () => Date.now() + 120_000;
    let release!: () => void;
    const running = engine.enqueue(far(), () => new Promise<void>((r) => { release = r; }));
    await new Promise((r) => setTimeout(r, 0));
    const waiting = engine.enqueue(far(), async () => "b");
    await expect(engine.enqueue(far(), async () => "c")).rejects.toThrow(/capacity is busy/);
    release();
    await running;
    await expect(waiting).resolves.toBe("b");
  });

  it("refuses at the front of the queue a document whose deadline is too close to start", async () => {
    const work = vi.fn(async () => "never");
    await expect(engine.enqueue(Date.now() + engine.PAGE_START_RESERVE_MS - 1_000, work)).rejects.toThrow(/waited too long/);
    expect(work).not.toHaveBeenCalled();
  });

  it("splits a searchable PDF into parts that fit, and stops at the first page that does not", () => {
    const MB = 1024 * 1024;
    const limits = { max_file_bytes: 10 * MB, max_total_bytes: 25 * MB, max_parts: 9 };
    const pages = (sizes: number[]) => sizes.map((b, i) => ({ page_number: i + 1, bytes: b * MB }));
    expect(engine.planPdfParts(pages([1, 1, 1]), limits)).toEqual({ parts: [[1, 2, 3]], omittedFrom: null });
    // 4 MB pages: two per 10 MB file, and the 25 MB job total stops page 7.
    expect(engine.planPdfParts(pages([4, 4, 4, 4, 4, 4, 4]), limits)).toEqual({ parts: [[1, 2], [3, 4], [5, 6]], omittedFrom: 7 });
    // A single page over the file limit ends the PDF before it.
    expect(engine.planPdfParts(pages([1, 11, 1]), limits)).toEqual({ parts: [[1]], omittedFrom: 2 });
    expect(engine.planPdfParts(pages([6, 6, 6]), { ...limits, max_parts: 2 })).toEqual({ parts: [[1], [2]], omittedFrom: 3 });
    // The job total keeps the same margin as a file: merging adds a little.
    expect(engine.planPdfParts(pages([5, 5, 5, 5, 5]), limits)).toEqual({ parts: [[1], [2], [3], [4]], omittedFrom: 5 });
  });
});

// Needs tesseract (eng+swe) and poppler on the machine. CI's unit job has
// neither; image-boot-smoke runs the same fixture inside the production image
// (scripts/ci/ocr-probe.mjs), so the engine is exercised on every PR either way.
describe.skipIf(!hasBinaries())("document-ocr on a real scan", () => {
  it("reads both pages of the Riksdagen scan and returns text and PDF files", async () => {
    const r = await exec({ base64: fixtureB64(), output_file: "both", languages: "swe+eng" });
    const o = r.output as Record<string, any>;
    expect(o.total_pages).toBe(2);
    expect(o.pages_processed).toBe(2);
    expect(o.complete).toBe(true);
    expect(o.next_first_page).toBeNull();
    expect(o.pages[0].text).toContain("arbetarskyddslagen");
    expect(o.pages[0].text).toContain("jämställdhet");
    expect(o.mean_confidence).toBeGreaterThan(80);
    expect(r.files?.map((f) => f.name)).toEqual(["ocr-pages-1-2.txt", "ocr-pages-1-2.pdf"]);
    expect(Buffer.from(r.files![1].data).subarray(0, 5).toString()).toBe("%PDF-");
    expect(r.provenance.source).toBe("Tesseract OCR (self-hosted)");
  }, 60_000);

  it("reads a window and says where to continue", async () => {
    const r = await exec({ base64: fixtureB64(), max_pages: 1, output_file: "none" });
    const o = r.output as Record<string, any>;
    expect(o.pages.map((p: { page_number: number }) => p.page_number)).toEqual([1]);
    expect(o.next_first_page).toBe(2);
    expect(o.complete).toBe(false);
    expect(r.files).toBeUndefined();
    await expect(exec({ base64: fixtureB64(), first_page: 3 })).rejects.toThrow(/'first_page' must be at most 2/);
  }, 60_000);

  it("ends the result at a page the deadline cut off, so the caller can continue from it", async () => {
    const r = await engine.ocrDocument(
      { kind: "pdf", data: readFileSync(FIXTURE) },
      { languages: ["swe"], first_page: 1, max_pages: 2, deadline: Date.now() + 5_600, searchable_pdf: null, start_reserve_ms: 0 },
    );
    expect(r.stopped_by_time_budget).toBe(true);
    expect(r.pages.length).toBeLessThan(2);
    // A page the deadline cut off is left unread, never reported as a bad page.
    expect(r.pages.every((p) => p.status === "ok")).toBe(true);
  }, 60_000);

  it("reads an image set window, marks an undecodable page failed and keeps the rest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ocr-test-"));
    try {
      execFileSync("pdftoppm", ["-f", "2", "-l", "2", "-singlefile", "-r", "150", "-png", FIXTURE, join(dir, "p")]);
      const png = readFileSync(join(dir, "p.png"));
      const bodies: Record<string, Buffer> = { "https://img.example/2.png": Buffer.from("not an image"), "https://img.example/3.png": png };
      safeFetch.mockImplementation(async (url: string) => new Response(bodies[url] ?? png, { status: 200, headers: { "content-type": "image/png" } }));
      const urls = [1, 2, 3, 4].map((n) => `https://img.example/${n}.png`);
      const r = await exec({ image_urls: urls, first_page: 2, max_pages: 2, output_file: "none" });
      const o = r.output as Record<string, any>;
      expect(safeFetch.mock.calls.map((c) => c[0]).sort()).toEqual(["https://img.example/2.png", "https://img.example/3.png"]);
      expect(o.pages.map((p: { page_number: number; status: string }) => [p.page_number, p.status])).toEqual([[2, "failed"], [3, "ok"]]);
      expect(o.pages[0].error).toMatch(/could not be decoded|could not be read/);
      expect(o.next_first_page).toBe(4);
      expect(o.pages_failed).toBe(1);
    } finally {
      safeFetch.mockReset();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("reads an image and refuses bytes that are neither PDF nor image", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ocr-test-"));
    try {
      execFileSync("pdftoppm", ["-f", "2", "-l", "2", "-singlefile", "-r", "150", "-png", FIXTURE, join(dir, "p")]);
      const png = readFileSync(join(dir, "p.png")).toString("base64");
      const r = await exec({ base64: png, output_file: "none" });
      const o = r.output as Record<string, any>;
      expect(o.total_pages).toBe(1);
      expect(o.pages[0].status).toBe("ok");
      expect(o.pages[0].word_count).toBeGreaterThan(20);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    await expect(exec({ base64: Buffer.from("not a document at all").toString("base64") })).rejects.toThrow(/must be a PDF or a PNG/);
  }, 60_000);
});
