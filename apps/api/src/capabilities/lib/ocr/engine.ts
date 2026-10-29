/**
 * Self-hosted OCR for document-ocr (portfolio plan 2.4).
 *
 * Tesseract 5 and poppler run as child processes inside the API container;
 * the Dockerfile installs both and the image-boot-smoke CI job runs
 * scripts/ci/ocr-probe.mjs against the built image, so a missing binary or
 * language pack fails CI, not a customer's job. Route chosen and measured in
 * docs/research/2026-10-29-transcription-and-bulk-ocr-vendors.md: no vendor
 * account, nothing leaves Strale.
 *
 * Every bound lives here:
 *  - one document at a time per process, at most MAX_QUEUED_JOBS waiting, and
 *    a job that waited MAX_QUEUE_WAIT_MS is refused (it is uncharged);
 *  - PAGE_WORKERS pages in flight per document, each child single-threaded
 *    (OMP_THREAD_LIMIT=1), at nice 10 so API requests keep the CPU first;
 *  - every child under prlimit: address space CHILD_MAX_AS_BYTES and
 *    CHILD_MAX_CPU_SECONDS of CPU, plus a wall-clock kill;
 *  - pages render to at most RENDER_LONG_SIDE_PX on the long side (300 dpi on
 *    A4), so a PDF declaring a huge page cannot buy a huge bitmap;
 *  - no new page starts after JOB_BUDGET_MS; the pages done so far are
 *    returned and the caller continues from `next_first_page`.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

/** Languages the image installs (Dockerfile); a call may combine up to three. */
export const SUPPORTED_LANGUAGES = ["eng", "swe", "dan", "nor", "fin", "deu", "fra", "spa", "ita", "nld"] as const;
export type OcrLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const MAX_LANGUAGES = 3;

export const PAGE_WORKERS = 2;
export const MAX_QUEUED_JOBS = 2;
export const MAX_QUEUE_WAIT_MS = 60_000;
/** Kept well under the async path's 300 s hard timeout (dispatch.ts). */
export const JOB_BUDGET_MS = 180_000;
export const RENDER_LONG_SIDE_PX = 3508;
/** Images larger than this on the long side are scaled down before OCR. */
export const IMAGE_MAX_LONG_SIDE_PX = 5000;
/** Decode guard for caller images (sharp's limitInputPixels). */
export const IMAGE_MAX_INPUT_PIXELS = 60_000_000;
export const CHILD_MAX_AS_BYTES = 1536 * 1024 * 1024;
export const CHILD_MAX_CPU_SECONDS = 90;
const PDFINFO_TIMEOUT_MS = 15_000;
const RENDER_TIMEOUT_MS = 45_000;
const OCR_TIMEOUT_MS = 75_000;
const MERGE_TIMEOUT_MS = 30_000;

export interface OcrPage {
  page_number: number;
  status: "ok" | "failed";
  text: string;
  /** Mean Tesseract word confidence, 0–100; null when no word was read. */
  mean_confidence: number | null;
  word_count: number;
  error?: string;
}

export interface OcrResult {
  pages: OcrPage[];
  /** Pages in the source document (PDF page count, or images supplied). */
  total_pages: number;
  /** One searchable PDF for the pages read, when it was asked for. */
  searchable_pdf: Buffer | null;
  /** True when JOB_BUDGET_MS stopped the run before every requested page started. */
  stopped_by_time_budget: boolean;
}

export type OcrSource =
  | { kind: "pdf"; data: Buffer }
  /** Already within the page window; `first_page_number` numbers them. */
  | { kind: "images"; images: Buffer[]; total_pages: number };

export interface OcrOptions {
  languages: OcrLanguage[];
  first_page: number;
  max_pages: number;
  searchable_pdf: boolean;
}

/** A failure caused by the document itself (encrypted, not a PDF, undecodable). */
export class OcrInputError extends Error {
  readonly isCapabilityRefusal = true;
  constructor(message: string) {
    super(message);
    this.name = "OcrInputError";
  }
}

// ── child processes ─────────────────────────────────────────────────────────

interface RunResult { stdout: string; stderr: string }

const CHILD_ENV = { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", OMP_THREAD_LIMIT: "1", LANG: "C.UTF-8" };

/** Run a binary under prlimit and nice with a wall-clock kill. Exported for the boot probe. */
export function runBounded(bin: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "prlimit",
      [`--as=${CHILD_MAX_AS_BYTES}`, `--cpu=${CHILD_MAX_CPU_SECONDS}`, "--", "nice", "-n", "10", bin, ...args],
      // A fixed, minimal environment: the children never see the API's secrets.
      { env: CHILD_ENV, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => { if (stdout.length < 1_000_000) stdout += c.toString("utf8"); });
    child.stderr.on("data", (c: Buffer) => { if (stderr.length < 8_000) stderr += c.toString("utf8"); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} ${signal ? `was killed (${signal})` : `exited with code ${code}`}: ${stderr.trim().slice(0, 300)}`));
    });
  });
}

let engineVersion: string | null = null;

/** "tesseract 5.3.0" — read once per process, for provenance. */
export async function tesseractVersion(): Promise<string> {
  if (engineVersion) return engineVersion;
  const { stdout, stderr } = await runBounded("tesseract", ["--version"], 10_000);
  engineVersion = (stdout || stderr).split("\n")[0].trim() || "tesseract";
  return engineVersion;
}

/** Language packs actually present in this container. */
export async function installedLanguages(): Promise<string[]> {
  const { stdout } = await runBounded("tesseract", ["--list-langs"], 10_000);
  return stdout.split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
}

// ── parsing ─────────────────────────────────────────────────────────────────

/** Page count from `pdfinfo` output; refuses encrypted documents. */
export function parsePdfInfo(stdout: string): number {
  if (/^Encrypted:\s+yes/m.test(stdout)) {
    throw new OcrInputError("'url' or 'base64' must be a PDF without a password or encryption; this one is encrypted.");
  }
  const m = stdout.match(/^Pages:\s+(\d+)/m);
  if (!m) throw new OcrInputError("'url' or 'base64' must be a readable PDF; its page count could not be read.");
  return Number(m[1]);
}

/** Mean word confidence and word count from Tesseract's TSV output. */
export function parseTsv(tsv: string): { mean_confidence: number | null; word_count: number } {
  let sum = 0;
  let n = 0;
  for (const line of tsv.split("\n").slice(1)) {
    const cols = line.split("\t");
    // level 5 = word; conf -1 marks non-text boxes.
    if (cols[0] !== "5" || cols.length < 12) continue;
    const conf = Number(cols[10]);
    if (!Number.isFinite(conf) || conf < 0 || !cols[11]?.trim()) continue;
    sum += conf;
    n++;
  }
  return { mean_confidence: n > 0 ? Math.round((sum / n) * 10) / 10 : null, word_count: n };
}

// ── the queue ───────────────────────────────────────────────────────────────

let chain: Promise<unknown> = Promise.resolve();
let queued = 0;

/**
 * Capacity, not caller input: a full queue counts against health like any
 * other overload, so sustained demand above capacity shows up and can trip
 * the breaker rather than queueing work nobody waits for.
 */
function queueRefusal(reason: string): Error {
  return new Error(`OCR capacity is busy: ${reason}; nothing was charged, retry in a minute.`);
}

/** Run documents one after another. Exported for tests. */
export function enqueue<T>(work: () => Promise<T>): Promise<T> {
  if (queued >= MAX_QUEUED_JOBS) return Promise.reject(queueRefusal("too many documents are queued"));
  queued++;
  const enqueuedAt = Date.now();
  const run = chain.then(async () => {
    queued--;
    if (Date.now() - enqueuedAt > MAX_QUEUE_WAIT_MS) throw queueRefusal("the document waited too long in the queue");
    return work();
  });
  chain = run.catch(() => undefined);
  return run;
}

// ── pages ───────────────────────────────────────────────────────────────────

/**
 * Normalise a caller image to a grayscale PNG Tesseract can read. Tesseract
 * never parses caller bytes directly: sharp decodes them under a pixel cap.
 */
export async function normaliseImage(data: Buffer, page = 0): Promise<Buffer> {
  try {
    return await sharp(data, { limitInputPixels: IMAGE_MAX_INPUT_PIXELS, page })
      .rotate()
      .resize({ width: IMAGE_MAX_LONG_SIDE_PX, height: IMAGE_MAX_LONG_SIDE_PX, fit: "inside", withoutEnlargement: true })
      .grayscale()
      .png()
      .toBuffer();
  } catch (err) {
    throw new OcrInputError(
      `'url' or 'base64' must be a PDF or a PNG, JPEG, WebP or TIFF image of at most ${IMAGE_MAX_INPUT_PIXELS / 1_000_000} megapixels (${(err as Error).message.slice(0, 120)}).`,
    );
  }
}

/** Number of pages (frames) in an image; a multi-page TIFF has several. */
export async function imagePageCount(data: Buffer): Promise<number> {
  try {
    const meta = await sharp(data, { limitInputPixels: IMAGE_MAX_INPUT_PIXELS }).metadata();
    return meta.pages && meta.pages > 1 ? meta.pages : 1;
  } catch (err) {
    throw new OcrInputError(
      `'url' or 'base64' must be a PDF or a PNG, JPEG, WebP or TIFF image (${(err as Error).message.slice(0, 120)}).`,
    );
  }
}

async function ocrPage(png: string, outBase: string, pageNumber: number, opts: OcrOptions): Promise<OcrPage> {
  const configs = opts.searchable_pdf ? ["txt", "tsv", "pdf"] : ["txt", "tsv"];
  await runBounded("tesseract", [png, outBase, "-l", opts.languages.join("+"), "--psm", "3", ...configs], OCR_TIMEOUT_MS);
  const text = (await readFile(`${outBase}.txt`, "utf8")).replace(/\f/g, "").trimEnd();
  const stats = parseTsv(await readFile(`${outBase}.tsv`, "utf8"));
  return { page_number: pageNumber, status: "ok", text, ...stats };
}

function failedPage(pageNumber: number, err: unknown): OcrPage {
  const msg = err instanceof Error ? err.message : String(err);
  const reason = /killed|SIGKILL|SIGXCPU/.test(msg) ? "the page took too long or too much memory to read" : "the page could not be read";
  return { page_number: pageNumber, status: "failed", text: "", mean_confidence: null, word_count: 0, error: reason };
}

/**
 * OCR a document. Pages run PAGE_WORKERS at a time; the result lists pages in
 * order and stops at the first page that never started (time budget), so the
 * returned pages are always a contiguous run from `first_page`.
 */
export function ocrDocument(source: OcrSource, opts: OcrOptions): Promise<OcrResult> {
  return enqueue(() => runDocument(source, opts));
}

async function runDocument(source: OcrSource, opts: OcrOptions): Promise<OcrResult> {
  const started = Date.now();
  const dir = await mkdtemp(join(tmpdir(), "strale-ocr-"));
  try {
    let total: number;
    let pageNumbers: number[];
    let preparePage: (pageNumber: number, png: string) => Promise<void>;

    if (source.kind === "pdf") {
      const pdf = join(dir, "input.pdf");
      await writeFile(pdf, source.data);
      let info: RunResult;
      try {
        info = await runBounded("pdfinfo", [pdf], PDFINFO_TIMEOUT_MS);
      } catch {
        throw new OcrInputError("'url' or 'base64' must be a readable PDF; this one could not be opened.");
      }
      total = parsePdfInfo(info.stdout);
      if (opts.first_page > total) {
        throw new OcrInputError(`'first_page' must be at most ${total}, the document's page count.`);
      }
      const last = Math.min(total, opts.first_page + opts.max_pages - 1);
      pageNumbers = range(opts.first_page, last);
      preparePage = async (n, png) => {
        const base = png.slice(0, -".png".length);
        await runBounded(
          "pdftoppm",
          ["-f", String(n), "-l", String(n), "-singlefile", "-scale-to", String(RENDER_LONG_SIDE_PX), "-gray", "-png", pdf, base],
          RENDER_TIMEOUT_MS,
        );
      };
    } else {
      total = source.total_pages;
      pageNumbers = source.images.map((_, i) => opts.first_page + i);
      preparePage = async (n, png) => {
        await writeFile(png, source.images[n - opts.first_page]);
      };
    }

    const results = new Map<number, OcrPage>();
    let nextIndex = 0;
    let stoppedByBudget = false;
    const worker = async () => {
      while (nextIndex < pageNumbers.length) {
        if (Date.now() - started > JOB_BUDGET_MS) {
          stoppedByBudget = true;
          return;
        }
        const n = pageNumbers[nextIndex++];
        const png = join(dir, `page-${n}.png`);
        try {
          await preparePage(n, png);
          results.set(n, await ocrPage(png, join(dir, `page-${n}`), n, opts));
        } catch (err) {
          results.set(n, failedPage(n, err));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PAGE_WORKERS, pageNumbers.length) }, worker));

    const pages: OcrPage[] = [];
    for (const n of pageNumbers) {
      const p = results.get(n);
      if (!p) break;
      pages.push(p);
    }

    let searchablePdf: Buffer | null = null;
    const okPages = pages.filter((p) => p.status === "ok");
    if (opts.searchable_pdf && okPages.length > 0) {
      const parts = okPages.map((p) => join(dir, `page-${p.page_number}.pdf`));
      if (parts.length === 1) {
        searchablePdf = await readFile(parts[0]);
      } else {
        const merged = join(dir, "searchable.pdf");
        await runBounded("pdfunite", [...parts, merged], MERGE_TIMEOUT_MS);
        searchablePdf = await readFile(merged);
      }
    }

    return { pages, total_pages: total, searchable_pdf: searchablePdf, stopped_by_time_budget: stoppedByBudget };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}
