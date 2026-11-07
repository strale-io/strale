/**
 * Worker-thread entry for HTML → Markdown conversion (robustness R1).
 *
 * The conversion (bounding pre-pass, jsdom parse, Readability, Turndown) is
 * synchronous, CPU-bound and, for hostile markup, slow. Running it here keeps
 * the API's event loop free; readability-convert.ts terminates this worker
 * when a conversion passes its wall-clock limit.
 *
 * Protocol: the parent posts { id, html, url }; the worker answers
 * { id, ok: true, result } or { id, ok: false, tooComplex, message }.
 */
import { parentPort } from "node:worker_threads";
import { HtmlTooComplexError } from "./html-parse-bound.js";
import { convertHtmlToMarkdownSync } from "./readability-convert-sync.js";

if (!parentPort) throw new Error("readability-worker must run as a worker thread");
const port = parentPort;

port.on("message", (msg: { id: number; html: string; url: string }) => {
  try {
    const result = convertHtmlToMarkdownSync(msg.html, msg.url);
    port.postMessage({ id: msg.id, ok: true, result });
  } catch (err) {
    port.postMessage({
      id: msg.id,
      ok: false,
      tooComplex: err instanceof HtmlTooComplexError,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
