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
 *  - one document at a time per process and one waiting; a document that
 *    reaches the front with too little of its deadline left is refused
 *    (uncharged) rather than started;
 *  - one deadline per call (the caller sets it, see document-ocr.ts): no page
 *    starts once less than PAGE_START_RESERVE_MS remains, every child's
 *    wall-clock kill is capped at the time left, and a page cut off by the
 *    deadline ends the result there, so what is returned is always a
 *    contiguous run of pages the caller can continue from;
 *  - PAGE_WORKERS pages in flight per document, each child single-threaded
 *    (OMP_THREAD_LIMIT=1), at nice 10 so API requests keep the CPU first;
 *  - every child under prlimit (address space CHILD_MAX_AS_BYTES, CPU
 *    CHILD_MAX_CPU_SECONDS), with a fixed minimal environment, and — when the
 *    API runs as root, as in the production image — as the unprivileged
 *    CHILD_USER, so a parser bug in poppler cannot read the API's memory,
 *    environment or files;
 *  - pages render to at most RENDER_LONG_SIDE_PX on the long side (300 dpi on
 *    A4), and caller images are decoded by sharp under IMAGE_MAX_INPUT_PIXELS,
 *    inside the queue, one page at a time.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chown, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

/** Languages the image installs (Dockerfile); a call may combine up to three. */
export const SUPPORTED_LANGUAGES = ["eng", "swe", "dan", "nor", "fin", "deu", "fra", "spa", "ita", "nld"] as const;
export type OcrLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const MAX_LANGUAGES = 3;

export const PAGE_WORKERS = 2;
export const MAX_QUEUED_JOBS = 1;
/** A document is not started, nor a page, with less than this left. */
export const PAGE_START_RESERVE_MS = 25_000;
/** Kept back from the deadline for the merge and the capture. */
const DEADLINE_MARGIN_MS = 5_000;
export const RENDER_LONG_SIDE_PX = 3508;
/** Images larger than this on the long side are scaled down before OCR. */
export const IMAGE_MAX_LONG_SIDE_PX = 5000;
/** Decode guard for caller images (sharp's limitInputPixels). */
export const IMAGE_MAX_INPUT_PIXELS = 60_000_000;
export const CHILD_MAX_AS_BYTES = 1536 * 1024 * 1024;
export const CHILD_MAX_CPU_SECONDS = 90;
/** Created by the Dockerfile; children run as this user when the API is root. */
export const CHILD_USER = "strale-ocr";
/** JPEG quality for page images embedded in a searchable PDF, when JPEG is the smaller. */
const PDF_JPEG_QUALITY = 60;
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

export interface PdfPart {
  first_page: number;
  last_page: number;
  data: Buffer;
}

export interface OcrResult {
  pages: OcrPage[];
  /** Pages in the source document (PDF page count, or images supplied). */
  total_pages: number;
  /** The searchable PDF in one or more parts, in page order; empty when not asked for. */
  pdf_parts: PdfPart[];
  /** First read page left out of the PDF parts (size or time limits), or null. */
  pdf_omitted_from_page: number | null;
  /** True when the deadline stopped the run before every requested page was read. */
  stopped_by_time_budget: boolean;
}

/** One caller image page: the raw bytes and which frame of them (multi-page TIFF). */
export interface ImagePage { data: Buffer; frame: number }

export type OcrSource =
  | { kind: "pdf"; data: Buffer }
  /** Already within the page window; numbered from `first_page`. */
  | { kind: "images"; pages: ImagePage[]; total_pages: number };

export interface PdfLimits { max_file_bytes: number; max_total_bytes: number; max_parts: number }

export interface OcrOptions {
  languages: OcrLanguage[];
  first_page: number;
  max_pages: number;
  /** Epoch ms after which nothing new starts and running children are cut off. */
  deadline: number;
  /** Set to produce a searchable PDF, split to fit these limits. */
  searchable_pdf: PdfLimits | null;
  /** Tests only: overrides PAGE_START_RESERVE_MS. */
  start_reserve_ms?: number;
}

/** A failure caused by the document itself (not a PDF, unreadable, undecodable). */
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

let childIdentityCache: { uid: number; gid: number } | null | undefined;

/** The uid/gid children run as: CHILD_USER when this process is root and the user exists. */
export function childIdentity(): { uid: number; gid: number } | null {
  if (childIdentityCache !== undefined) return childIdentityCache;
  childIdentityCache = null;
  if (process.getuid?.() === 0) {
    try {
      const line = readFileSync("/etc/passwd", "utf8").split("\n").find((l) => l.startsWith(`${CHILD_USER}:`));
      const [, , uid, gid] = line?.split(":") ?? [];
      if (uid && gid && Number(uid) > 0) childIdentityCache = { uid: Number(uid), gid: Number(gid) };
    } catch {
      // No passwd file: run as the current user.
    }
  }
  return childIdentityCache;
}

/** Run a binary under prlimit and nice with a wall-clock kill. Exported for the boot probe. */
export function runBounded(bin: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const identity = childIdentity();
    // prlimit and nice exec into the next program, so the kill reaches the binary itself.
    const child = spawn(
      "prlimit",
      [`--as=${CHILD_MAX_AS_BYTES}`, `--cpu=${CHILD_MAX_CPU_SECONDS}`, "--", "nice", "-n", "10", bin, ...args],
      { env: CHILD_ENV, stdio: ["ignore", "pipe", "pipe"], ...(identity ?? {}) },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => { if (stdout.length < 1_000_000) stdout += c.toString("utf8"); });
    child.stderr.on("data", (c: Buffer) => { if (stderr.length < 8_000) stderr += c.toString("utf8"); });
    const timer = setTimeout(() => child.kill("SIGKILL"), Math.max(1, timeoutMs));
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

/**
 * Page count from `pdfinfo` output. An owner-password PDF ("Encrypted: yes
 * (print:yes …)") opens and renders and is accepted; one that needs a password
 * to open already failed pdfinfo.
 */
export function parsePdfInfo(stdout: string): number {
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

/**
 * Split page PDFs into contiguous parts that fit the file limits. Stops at the
 * first page that no longer fits, so the parts always cover a prefix.
 * Sizes are the single-page PDFs; merging adds a little, hence the margin.
 */
export function planPdfParts(pages: { page_number: number; bytes: number }[], limits: PdfLimits): { parts: number[][]; omittedFrom: number | null } {
  const perFile = Math.floor(limits.max_file_bytes * 0.97);
  const parts: number[][] = [];
  let current: number[] = [];
  let currentBytes = 0;
  let total = 0;
  for (const p of pages) {
    if (p.bytes > perFile || total + p.bytes > limits.max_total_bytes) return { parts: close(), omittedFrom: p.page_number };
    if (currentBytes + p.bytes > perFile) {
      if (parts.length + 1 >= limits.max_parts) return { parts: close(), omittedFrom: p.page_number };
      parts.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(p.page_number);
    currentBytes += p.bytes;
    total += p.bytes;
  }
  return { parts: close(), omittedFrom: null };

  function close(): number[][] {
    return current.length > 0 ? [...parts, current] : parts;
  }
}

// ── the queue ───────────────────────────────────────────────────────────────

let chain: Promise<unknown> = Promise.resolve();
let queued = 0;

/**
 * Capacity, not caller input: a full queue counts against health like any
 * other overload, so sustained demand above capacity shows up rather than
 * queueing work nobody waits for.
 */
function busy(reason: string): Error {
  return new Error(`OCR capacity is busy: ${reason}; nothing was charged, retry in a minute.`);
}

/** Run documents one after another. Exported for tests. */
export function enqueue<T>(deadline: number, work: () => Promise<T>, reserveMs = PAGE_START_RESERVE_MS): Promise<T> {
  if (queued >= MAX_QUEUED_JOBS) return Promise.reject(busy("another document is already waiting"));
  queued++;
  const run = chain.then(async () => {
    queued--;
    if (deadline - Date.now() < reserveMs) throw busy("the document waited too long in the queue");
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
  return sharp(data, { limitInputPixels: IMAGE_MAX_INPUT_PIXELS, page })
    .rotate()
    .resize({ width: IMAGE_MAX_LONG_SIDE_PX, height: IMAGE_MAX_LONG_SIDE_PX, fit: "inside", withoutEnlargement: true })
    .grayscale()
    .png()
    .toBuffer();
}

/** Number of pages (frames) in an image; a multi-page TIFF has several. Reads the header only. */
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

/**
 * For a searchable PDF Tesseract embeds its input image as is, so give it the
 * smaller of a grayscale PNG (bitonal scans) and a JPEG (photographic scans).
 */
async function smallestPageImage(png: string, base: string): Promise<string> {
  const img = sharp(await readFile(png)).grayscale();
  const [asPng, asJpeg] = await Promise.all([img.clone().png().toBuffer(), img.clone().jpeg({ quality: PDF_JPEG_QUALITY }).toBuffer()]);
  const path = asJpeg.length < asPng.length ? `${base}.jpg` : png;
  await writeFile(path, asJpeg.length < asPng.length ? asJpeg : asPng);
  return path;
}

function failedPage(pageNumber: number, err: unknown): OcrPage {
  const msg = err instanceof Error ? err.message : String(err);
  const reason = /killed|SIGKILL|SIGXCPU/.test(msg)
    ? "the page took too long or too much memory to read"
    : /limitInputPixels|pixel limit/i.test(msg)
      ? `the image is over ${IMAGE_MAX_INPUT_PIXELS / 1_000_000} megapixels`
      : /unsupported image format|Input buffer/i.test(msg)
        ? "the image could not be decoded (PNG, JPEG, WebP or TIFF expected)"
        : "the page could not be read";
  return { page_number: pageNumber, status: "failed", text: "", mean_confidence: null, word_count: 0, error: reason };
}

/** Time a child may take: its own limit, capped at what is left of the deadline. */
function within(deadline: number, ownMs: number): number {
  return Math.min(ownMs, deadline - DEADLINE_MARGIN_MS - Date.now());
}

/** OCR a document: queued, then pages PAGE_WORKERS at a time, in page order. */
export function ocrDocument(source: OcrSource, opts: OcrOptions): Promise<OcrResult> {
  return enqueue(opts.deadline, () => runDocument(source, opts), opts.start_reserve_ms);
}

async function runDocument(source: OcrSource, opts: OcrOptions): Promise<OcrResult> {
  const { deadline } = opts;
  const dir = await mkdtemp(join(tmpdir(), "strale-ocr-"));
  try {
    const identity = childIdentity();
    if (identity) await chown(dir, identity.uid, identity.gid);

    let total: number;
    let pageNumbers: number[];
    let preparePage: (pageNumber: number, png: string) => Promise<void>;

    if (source.kind === "pdf") {
      const pdf = join(dir, "input.pdf");
      await writeFile(pdf, source.data);
      let info: RunResult;
      try {
        info = await runBounded("pdfinfo", [pdf], within(deadline, PDFINFO_TIMEOUT_MS));
      } catch {
        throw new OcrInputError("'url' or 'base64' must be a readable PDF that opens without a password; this one could not be opened.");
      }
      total = parsePdfInfo(info.stdout);
      if (opts.first_page > total) {
        throw new OcrInputError(`'first_page' must be at most ${total}, the document's page count.`);
      }
      const last = Math.min(total, opts.first_page + opts.max_pages - 1);
      pageNumbers = range(opts.first_page, last);
      preparePage = async (n, png) => {
        await runBounded(
          "pdftoppm",
          ["-f", String(n), "-l", String(n), "-singlefile", "-scale-to", String(RENDER_LONG_SIDE_PX), "-gray", "-png", pdf, png.slice(0, -".png".length)],
          within(deadline, RENDER_TIMEOUT_MS),
        );
      };
    } else {
      total = source.total_pages;
      pageNumbers = source.pages.map((_, i) => opts.first_page + i);
      preparePage = async (n, png) => {
        const page = source.pages[n - opts.first_page];
        await writeFile(png, await normaliseImage(page.data, page.frame));
      };
    }

    const results = new Map<number, OcrPage>();
    let nextIndex = 0;
    let stoppedByBudget = false;
    const worker = async () => {
      while (nextIndex < pageNumbers.length && !stoppedByBudget) {
        if (deadline - Date.now() < (opts.start_reserve_ms ?? PAGE_START_RESERVE_MS)) {
          stoppedByBudget = true;
          return;
        }
        const n = pageNumbers[nextIndex++];
        const base = join(dir, `page-${n}`);
        try {
          await preparePage(n, `${base}.png`);
          const input = opts.searchable_pdf ? await smallestPageImage(`${base}.png`, base) : `${base}.png`;
          const configs = opts.searchable_pdf ? ["txt", "tsv", "pdf"] : ["txt", "tsv"];
          await runBounded("tesseract", [input, base, "-l", opts.languages.join("+"), "--psm", "3", ...configs], within(deadline, OCR_TIMEOUT_MS));
          const text = (await readFile(`${base}.txt`, "utf8")).replace(/\f/g, "").trimEnd();
          results.set(n, { page_number: n, status: "ok", text, ...parseTsv(await readFile(`${base}.tsv`, "utf8")) });
        } catch (err) {
          // Cut off by the deadline, not a bad page: leave it unread so the
          // result ends before it and the caller continues from here.
          if (Date.now() >= deadline - DEADLINE_MARGIN_MS - 1_000) {
            stoppedByBudget = true;
            return;
          }
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

    const { parts, omittedFrom } = opts.searchable_pdf
      ? await buildPdfParts(dir, pages.filter((p) => p.status === "ok").map((p) => p.page_number), opts.searchable_pdf, deadline)
      : { parts: [], omittedFrom: null };

    return { pages, total_pages: total, pdf_parts: parts, pdf_omitted_from_page: omittedFrom, stopped_by_time_budget: stoppedByBudget };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function buildPdfParts(dir: string, okPages: number[], limits: PdfLimits, deadline: number): Promise<{ parts: PdfPart[]; omittedFrom: number | null }> {
  const sized = await Promise.all(okPages.map(async (n) => ({ page_number: n, bytes: (await stat(join(dir, `page-${n}.pdf`))).size })));
  const plan = planPdfParts(sized, limits);
  const parts: PdfPart[] = [];
  for (const group of plan.parts) {
    const files = group.map((n) => join(dir, `page-${n}.pdf`));
    let data: Buffer;
    if (files.length === 1) {
      data = await readFile(files[0]);
    } else {
      const timeout = within(deadline, MERGE_TIMEOUT_MS);
      if (timeout < 1_000) return { parts, omittedFrom: group[0] };
      const merged = join(dir, `part-${parts.length + 1}.pdf`);
      try {
        await runBounded("pdfunite", [...files, merged], timeout);
      } catch {
        return { parts, omittedFrom: group[0] };
      }
      data = await readFile(merged);
    }
    if (data.length > limits.max_file_bytes) return { parts, omittedFrom: group[0] };
    parts.push({ first_page: group[0], last_page: group[group.length - 1], data });
  }
  return { parts, omittedFrom: plan.omittedFrom };
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}
