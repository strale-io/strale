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
import { MAX_FILE_BYTES } from "../lib/jobs/files.js";
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
  imagePageCount,
  normaliseImage,
  ocrDocument,
  tesseractVersion,
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

async function fetchBytes(url: string, field: string, maxBytes: number): Promise<Buffer> {
  const resp = await safeFetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "application/pdf,image/*;q=0.9,*/*;q=0.5" } });
  assertNotBlockStatus(url, resp.status);
  if (!resp.ok) throw new Error(`Could not fetch the document: HTTP ${resp.status} from '${field}'.`);
  return readBodyWithLimit(resp, maxBytes, field);
}

interface Window { first_page: number; max_pages: number }

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
    const images: Buffer[] = [];
    let total = 0;
    for (const u of slice) {
      const raw = await fetchBytes(u.trim(), "image_urls", MAX_DECODED_IMAGE_BYTES);
      total += raw.length;
      if (total > MAX_DECODED_DOCUMENT_BYTES) {
        throw new ResourceLimitError(
          `'image_urls' must be ${(MAX_DECODED_DOCUMENT_BYTES / 1024 / 1024).toFixed(1)}MB or less in total per call; lower 'max_pages' to read fewer images at a time.`,
        );
      }
      if (isPdf(raw)) {
        throw inputRefusal("'image_urls' must point to images; send a PDF with 'url' instead.", "image_urls", "Send 'image_urls' as image URLs, and a PDF as 'url'.");
      }
      images.push(await normaliseImage(raw, 0));
    }
    return { source: { kind: "images", images, total_pages: imageUrls.length }, origin: "image_urls" };
  }

  let data: Buffer;
  let origin: string;
  if (url) {
    if (!httpUrl(url)) {
      throw inputRefusal("'url' must be an absolute http or https URL.", "url", "Send 'url' as a full http or https URL to the PDF or image.");
    }
    data = await fetchBytes(url, "url", MAX_DECODED_DOCUMENT_BYTES);
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
  const images: Buffer[] = [];
  for (let p = win.first_page; p <= last; p++) images.push(await normaliseImage(data, p - 1));
  return { source: { kind: "images", images, total_pages: frames }, origin };
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

  const { source, origin } = await loadSource(input, { first_page, max_pages });
  const result = await ocrDocument(source, {
    languages,
    first_page,
    max_pages,
    searchable_pdf: outputFile === "pdf" || outputFile === "both",
  });

  const pages = result.pages;
  const ok = pages.filter((p) => p.status === "ok");
  if (ok.length === 0) {
    throw new Error(`No page could be read (${pages[0]?.error ?? "no page was processed"}); nothing was charged.`);
  }
  const last_page = pages[pages.length - 1].page_number;
  const next_first_page = last_page < result.total_pages ? last_page + 1 : null;
  const words = ok.reduce((n, p) => n + p.word_count, 0);
  const weighted = ok.reduce((s, p) => s + (p.mean_confidence ?? 0) * p.word_count, 0);

  const files: CapabilityFile[] = [];
  let searchable_pdf_omitted_reason: string | null = null;
  const stem = `ocr-pages-${first_page}-${last_page}`;
  if (outputFile === "text" || outputFile === "both") {
    const body = pages.map((p) => `=== Page ${p.page_number} ===\n${p.status === "ok" ? p.text : `[not read: ${p.error}]`}\n`).join("\n");
    files.push({ name: `${stem}.txt`, content_type: "text/plain", data: Buffer.from(body, "utf8") });
  }
  if (outputFile === "pdf" || outputFile === "both") {
    if (result.searchable_pdf && result.searchable_pdf.length <= MAX_FILE_BYTES) {
      files.push({ name: `${stem}.pdf`, content_type: "application/pdf", data: result.searchable_pdf });
    } else {
      searchable_pdf_omitted_reason = result.searchable_pdf
        ? `The searchable PDF would be ${(result.searchable_pdf.length / 1024 / 1024).toFixed(1)} MB, over the ${MAX_FILE_BYTES / 1024 / 1024} MB file limit; lower 'max_pages'.`
        : "No page was read, so no PDF was made.";
    }
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
