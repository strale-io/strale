/**
 * document-ocr — read text from many-page scanned documents (portfolio 2.4).
 *
 * Self-hosted Tesseract 5 (lib/ocr/engine.ts); no vendor, nothing leaves
 * Strale. Runs on the async path (avg_latency_ms > 10 s): the call reserves
 * the price, the job OCRs up to MAX_PAGES_PER_CALL pages, and the reservation
 * is captured only on success. Per-page text is in the output; the full text
 * and an optional searchable PDF come back as job files (signed URLs on the
 * poll, lib/jobs/files.ts).
 *
 * Price: €0.10 per call for up to 50 pages, i.e. €0.002 a page on a full
 * window. Longer documents are read window by window with `first_page`; a
 * 500-page document is ten calls, €1.00. Compute measured at ≈ €0.025 per
 * 1,000 pages (research file above), so the margin holds at any window size.
 */
import { inputRefusal } from "../lib/capability-refusal.js";
import { MAX_FILE_BYTES, MAX_FILES_PER_JOB, MAX_TOTAL_FILE_BYTES } from "../lib/jobs/files.js";
import {
  MAX_DECODED_DOCUMENT_BYTES,
  MAX_DECODED_IMAGE_BYTES,
  ResourceLimitError,
  checkedBase64,
  readBodyWithLimit,
} from "../lib/resource-limits.js";
import { safeFetch } from "../lib/safe-fetch.js";
import { assertNotBlockStatus } from "../lib/site-access.js";
import {
  MAX_LANGUAGES,
  SUPPORTED_LANGUAGES,
  PAGE_START_RESERVE_MS,
  imagePageCount,
  ocrDocument,
  tesseractVersion,
  type ImagePage,
  type OcrLanguage,
  type OcrSource,
} from "./lib/ocr/engine.js";
import { registerCapability, type CapabilityFile, type CapabilityInput } from "./index.js";

export const MAX_PAGES_PER_CALL = 50;
/** Longest image list accepted; only the images inside the window are fetched. */
export const MAX_IMAGE_URLS = 500;
export const DEFAULT_LANGUAGES: OcrLanguage[] = ["eng", "swe"];
/** Pages under this mean word confidence are listed in low_confidence_pages. */
export const LOW_CONFIDENCE_BELOW = 70;
const FETCH_TIMEOUT_MS = 30_000;
/** Image-set pages fetched at once. */
const FETCH_CONCURRENCY = 4;
/**
 * One deadline per call, well inside the async path's 300 s hard timeout
 * (dispatch.ts EXEC_HARD_TIMEOUT_MS) so the pages read are returned rather
 * than lost to it. Kept per input object, so the platform's one transient
 * retry (lib/retry.ts) shares it instead of starting a second budget.
 */
export const CALL_BUDGET_MS = 240_000;
const deadlines = new WeakMap<object, number>();
/** Room kept in the 25 MB job-file total for the text file. */
const TEXT_FILE_RESERVE_BYTES = 2 * 1024 * 1024;
const OUTPUT_FILES = ["text", "pdf", "both", "none"] as const;
type OutputFile = (typeof OUTPUT_FILES)[number];

/** The value as a whole number from 1 to max, the fallback when absent, or null when invalid. */
function positiveInt(v: unknown, fallback: number, max: number): number | null {
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "string" ? Number(v.trim()) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}

function httpUrl(v: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(v).protocol);
  } catch {
    return false;
  }
}

export function parseLanguages(v: unknown): OcrLanguage[] {
  if (v === undefined || v === null || v === "") return [...DEFAULT_LANGUAGES];
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[+,\s]+/) : null;
  const langs = raw?.map((l) => String(l).trim().toLowerCase()).filter(Boolean) ?? [];
  const supported = new Set<string>(SUPPORTED_LANGUAGES);
  if (langs.length === 0 || langs.length > MAX_LANGUAGES || !langs.every((l) => supported.has(l))) {
    throw inputRefusal(
      `'languages' must be 1 to ${MAX_LANGUAGES} of: ${SUPPORTED_LANGUAGES.join(", ")}.`,
      "languages",
      `Send 'languages' as ISO 639-2 codes such as ["eng", "swe"] or "eng+swe".`,
    );
  }
  return [...new Set(langs)] as OcrLanguage[];
}

function parseOutputFile(v: unknown): OutputFile {
  if (v === undefined || v === null || v === "") return "text";
  const s = String(v).trim().toLowerCase();
  if (!(OUTPUT_FILES as readonly string[]).includes(s)) {
    throw inputRefusal(`'output_file' must be one of: ${OUTPUT_FILES.join(", ")}.`, "output_file", "Send 'output_file' as text, pdf, both or none.");
  }
  return s as OutputFile;
}

/** PDF if the header is in the first 1 KB (as readers accept), else an image. */
export function isPdf(data: Buffer): boolean {
  return data.subarray(0, 1024).includes("%PDF-");
}

async function fetchBytes(url: string, field: string, maxBytes: number, deadline: number): Promise<Buffer> {
  const ms = Math.min(FETCH_TIMEOUT_MS, deadline - PAGE_START_RESERVE_MS - Date.now());
  if (ms <= 0) throw new Error("Fetching the document took too long to leave time for OCR; nothing was charged.");
  const resp = await safeFetch(url, { signal: AbortSignal.timeout(ms), headers: { Accept: "application/pdf,image/*;q=0.9,*/*;q=0.5" } });
  assertNotBlockStatus(url, resp.status);
  if (!resp.ok) throw new Error(`Could not fetch the document: HTTP ${resp.status} from '${field}'.`);
  return readBodyWithLimit(resp, maxBytes, field);
}

interface Window { first_page: number; max_pages: number; deadline: number }

async function loadSource(input: CapabilityInput, win: Window): Promise<{ source: OcrSource; origin: string }> {
  const url = typeof input.url === "string" && input.url.trim() ? input.url.trim() : null;
  const base64 = typeof input.base64 === "string" && input.base64.trim() ? input.base64 : null;
  const imageUrls = input.image_urls;
  const given = [url, base64, imageUrls !== undefined && imageUrls !== null ? imageUrls : null].filter((x) => x !== null).length;
  if (given !== 1) {
    throw inputRefusal(
      "'url', 'base64' or 'image_urls' must be given, exactly one of them.",
      "url",
      "Send 'url' (a PDF or image), 'base64' (a PDF or image) or 'image_urls' (one image per page).",
    );
  }

  if (imageUrls !== undefined && imageUrls !== null) {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0 || imageUrls.length > MAX_IMAGE_URLS || !imageUrls.every((u) => typeof u === "string" && u.trim())) {
      throw inputRefusal(`'image_urls' must be a list of 1 to ${MAX_IMAGE_URLS} image URLs, one per page.`, "image_urls", "Send 'image_urls' as an array of URL strings.");
    }
    if (!imageUrls.every((u) => httpUrl(u.trim()))) {
      throw inputRefusal("'image_urls' must hold absolute http or https URLs.", "image_urls", "Send 'image_urls' as full http or https image URLs.");
    }
    if (win.first_page > imageUrls.length) {
      throw inputRefusal(`'first_page' must be at most ${imageUrls.length}, the number of images.`, "first_page", "Send 'first_page' as a page number within the image list, or omit it.");
    }
    const slice = (imageUrls as string[]).slice(win.first_page - 1, win.first_page - 1 + win.max_pages);
    // Fetched a few at a time; decoding waits for the OCR queue (engine.ts).
    const pages: ImagePage[] = new Array(slice.length);
    let total = 0;
    let next = 0;
    const fetchOne = async () => {
      while (next < slice.length) {
        const i = next++;
        const raw = await fetchBytes(slice[i].trim(), "image_urls", MAX_DECODED_IMAGE_BYTES, win.deadline);
        total += raw.length;
        if (total > MAX_DECODED_DOCUMENT_BYTES) {
          throw new ResourceLimitError(
            `'image_urls' must be ${(MAX_DECODED_DOCUMENT_BYTES / 1024 / 1024).toFixed(1)}MB or less in total per call; lower 'max_pages' to read fewer images at a time.`,
          );
        }
        if (isPdf(raw)) {
          throw inputRefusal("'image_urls' must point to images; send a PDF with 'url' instead.", "image_urls", "Send 'image_urls' as image URLs, and a PDF as 'url'.");
        }
        pages[i] = { data: raw, frame: 0 };
      }
    };
    await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, slice.length) }, fetchOne));
    return { source: { kind: "images", pages, total_pages: imageUrls.length }, origin: "image_urls" };
  }

  let data: Buffer;
  let origin: string;
  if (url) {
    if (!httpUrl(url)) {
      throw inputRefusal("'url' must be an absolute http or https URL.", "url", "Send 'url' as a full http or https URL to the PDF or image.");
    }
    data = await fetchBytes(url, "url", MAX_DECODED_DOCUMENT_BYTES, win.deadline);
    origin = `url:${new URL(url).hostname}`;
  } else {
    data = Buffer.from(checkedBase64(base64!, MAX_DECODED_DOCUMENT_BYTES), "base64");
    origin = "base64";
  }
  if (data.length === 0) {
    throw url
      ? inputRefusal("'url' must return a non-empty PDF or image.", "url", "Send 'url' as a link to a PDF or image with content.")
      : inputRefusal("'base64' must be a non-empty PDF or image.", "base64", "Send 'base64' as an encoded PDF or image with content.");
  }
  if (isPdf(data)) return { source: { kind: "pdf", data }, origin };

  const frames = await imagePageCount(data);
  if (win.first_page > frames) {
    throw inputRefusal(`'first_page' must be at most ${frames}, the image's page count.`, "first_page", "Send 'first_page' as a page number within the image, or omit it.");
  }
  const last = Math.min(frames, win.first_page + win.max_pages - 1);
  const pages: ImagePage[] = [];
  for (let p = win.first_page; p <= last; p++) pages.push({ data, frame: p - 1 });
  return { source: { kind: "images", pages, total_pages: frames }, origin };
}

registerCapability("document-ocr", async (input: CapabilityInput) => {
  const first_page = positiveInt(input.first_page, 1, 100_000);
  if (first_page === null) {
    throw inputRefusal("'first_page' must be a whole number from 1 to 100000.", "first_page", "Send 'first_page' as an integer of 1 or more, or omit it.");
  }
  const max_pages = positiveInt(input.max_pages, MAX_PAGES_PER_CALL, MAX_PAGES_PER_CALL);
  if (max_pages === null) {
    throw inputRefusal(`'max_pages' must be a whole number from 1 to ${MAX_PAGES_PER_CALL}.`, "max_pages", "Send 'max_pages' as an integer from 1 to 50, or omit it.");
  }
  const languages = parseLanguages(input.languages ?? input.language);
  const outputFile = parseOutputFile(input.output_file);

  let deadline = deadlines.get(input);
  if (deadline === undefined) {
    deadline = Date.now() + CALL_BUDGET_MS;
    deadlines.set(input, deadline);
  }
  const wantText = outputFile === "text" || outputFile === "both";
  const wantPdf = outputFile === "pdf" || outputFile === "both";

  const { source, origin } = await loadSource(input, { first_page, max_pages, deadline });
  const result = await ocrDocument(source, {
    languages,
    first_page,
    max_pages,
    deadline,
    searchable_pdf: wantPdf
      ? {
          max_file_bytes: MAX_FILE_BYTES,
          max_total_bytes: MAX_TOTAL_FILE_BYTES - (wantText ? TEXT_FILE_RESERVE_BYTES : 0),
          max_parts: MAX_FILES_PER_JOB - (wantText ? 1 : 0),
        }
      : null,
  });

  const pages = result.pages;
  const ok = pages.filter((p) => p.status === "ok");
  if (ok.length === 0) {
    throw new Error(
      pages.length === 0
        ? "OCR ran out of time before the first page was read; nothing was charged. Retry, or lower 'max_pages'."
        : `No page could be read (${pages[0].error}); nothing was charged.`,
    );
  }
  if (outputFile === "pdf" && result.pdf_parts.length === 0) {
    throw new Error(
      "The searchable PDF could not be made within the 10 MB file limit or the time limit; nothing was charged. Lower 'max_pages', or set 'output_file' to text.",
    );
  }
  const last_page = pages[pages.length - 1].page_number;
  const next_first_page = last_page < result.total_pages ? last_page + 1 : null;
  const words = ok.reduce((n, p) => n + p.word_count, 0);
  const weighted = ok.reduce((s, p) => s + (p.mean_confidence ?? 0) * p.word_count, 0);

  const files: CapabilityFile[] = [];
  let searchable_pdf_omitted_reason: string | null = null;
  const stem = `ocr-pages-${first_page}-${last_page}`;
  if (wantText) {
    const body = pages.map((p) => `=== Page ${p.page_number} ===\n${p.status === "ok" ? p.text : `[not read: ${p.error}]`}\n`).join("\n");
    files.push({ name: `${stem}.txt`, content_type: "text/plain", data: Buffer.from(body, "utf8") });
  }
  if (wantPdf) {
    for (const part of result.pdf_parts) {
      files.push({ name: `ocr-pages-${part.first_page}-${part.last_page}.pdf`, content_type: "application/pdf", data: part.data });
    }
    const failed = pages.filter((p) => p.status === "failed").map((p) => p.page_number);
    const notes: string[] = [];
    if (result.pdf_omitted_from_page !== null) {
      notes.push(
        `Pages from ${result.pdf_omitted_from_page} on are not in the searchable PDF: it would exceed the file limits (${MAX_FILE_BYTES / 1024 / 1024} MB a file, ${MAX_TOTAL_FILE_BYTES / 1024 / 1024} MB a job) or the time limit. Their text is in pages; read them again with first_page ${result.pdf_omitted_from_page} and a lower max_pages for the PDF.`,
      );
    }
    if (failed.length > 0) notes.push(`Pages ${failed.join(", ")} could not be read and are not in the PDF.`);
    searchable_pdf_omitted_reason = notes.length > 0 ? notes.join(" ") : null;
  }

  const engine = await tesseractVersion();
  return {
    output: {
      pages,
      total_pages: result.total_pages,
      first_page,
      last_page,
      pages_processed: pages.length,
      pages_failed: pages.length - ok.length,
      next_first_page,
      complete: next_first_page === null,
      stopped_early_reason: result.stopped_by_time_budget ? "time_budget" : null,
      mean_confidence: words > 0 ? Math.round((weighted / words) * 10) / 10 : null,
      low_confidence_pages: ok.filter((p) => p.mean_confidence !== null && p.mean_confidence < LOW_CONFIDENCE_BELOW).map((p) => p.page_number),
      word_count: words,
      languages,
      engine,
      output_files: files.map((f) => f.name),
      searchable_pdf_omitted_reason,
    },
    provenance: {
      source: "Tesseract OCR (self-hosted)",
      fetched_at: new Date().toISOString(),
      engine,
      languages,
      input: origin,
    },
    ...(files.length > 0 ? { files } : {}),
  };
});
