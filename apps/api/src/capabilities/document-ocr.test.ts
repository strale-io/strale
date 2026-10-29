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
  it("reads the page count and refuses an encrypted PDF", () => {
    expect(engine.parsePdfInfo("Title: x\nPages:           18\nEncrypted:       no\n")).toBe(18);
    expect(() => engine.parsePdfInfo("Pages: 2\nEncrypted:       yes (print:yes copy:no)\n")).toThrow(/encrypt/);
    expect(() => engine.parsePdfInfo("garbage")).toThrow(/page count/);
  });

  it("averages word confidence and ignores non-word rows", () => {
    const head = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
    const tsv = [head, "1\t1\t0\t0\t0\t0\t0\t0\t10\t10\t-1\t", "5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t90\tHej", "5\t1\t1\t1\t1\t2\t0\t0\t1\t1\t70\tvärld", "5\t1\t1\t1\t1\t3\t0\t0\t1\t1\t95\t "].join("\n");
    expect(engine.parseTsv(tsv)).toEqual({ mean_confidence: 80, word_count: 2 });
    expect(engine.parseTsv(head)).toEqual({ mean_confidence: null, word_count: 0 });
  });

  it("bounds the queue: at most two documents wait behind the running one", async () => {
    let release!: () => void;
    const running = engine.enqueue(() => new Promise<void>((r) => { release = r; }));
    await new Promise((r) => setTimeout(r, 0));
    const waiting = [engine.enqueue(async () => "b"), engine.enqueue(async () => "c")];
    await expect(engine.enqueue(async () => "d")).rejects.toThrow(/capacity is busy/);
    release();
    await running;
    await expect(Promise.all(waiting)).resolves.toEqual(["b", "c"]);
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
