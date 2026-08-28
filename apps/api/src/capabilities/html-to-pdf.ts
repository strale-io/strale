import { registerCapability, type CapabilityInput } from "./index.js";
import { assertTargetAllowed } from "../lib/tos-blocklist.js";
import { getBrowserlessConfig } from "./lib/browserless-extract.js";
import { buildBrowserlessRequestUrl } from "../lib/browserless-launch.js";
import { validateUrl } from "../lib/url-validator.js";
import { browserlessFetch } from "../lib/metered-vendor-fetch.js";
import { MAX_RENDERED_PDF_BYTES, readBodyWithLimit } from "./lib/image-limits.js";

registerCapability("html-to-pdf", async (input: CapabilityInput) => {
  const html = (input.html as string) ?? undefined;
  const url = (input.url as string) ?? undefined;

  if (!html && !url) throw new Error("'html' or 'url' is required.");

  const paperSize = ((input.paper_size as string) ?? "A4").toUpperCase();
  const landscape = input.landscape === true;
  const margins = (input.margins as Record<string, string>) ?? { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" };

  const { url: blessUrl, key } = getBrowserlessConfig();
  // buildBrowserlessRequestUrl appends ?launch= per-request, required by
  // Browserless v2 (LAUNCH_ARGS env var is deprecated). See lib/browserless-launch.ts.
  const endpoint = buildBrowserlessRequestUrl(blessUrl, "/pdf", key);

  const bodyObj: Record<string, unknown> = {
    options: {
      format: paperSize,
      landscape,
      printBackground: true,
      margin: margins,
    },
  };

  if (url) {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    // F-0-006: Browserless fetches the URL from its own network; validateUrl
    // refuses private-IP / bad-scheme URLs before the forward.
    await validateUrl(fullUrl);
    // ToS gate before forwarding to Browserless /pdf (it fetches from its own
    // network — safeFetch cannot cover this path; legal audit 2026-08-12).
    assertTargetAllowed(fullUrl);
    bodyObj.url = fullUrl;
    bodyObj.gotoOptions = { waitUntil: "networkidle0", timeout: 25000 };
  } else {
    bodyObj.html = html;
  }

  // unguarded-fetch-ok: our Browserless /pdf endpoint; caller URL gated by assertTargetAllowed above
  const response = await browserlessFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
    signal: AbortSignal.timeout(40000),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`Browserless PDF returned HTTP ${response.status}: ${err.slice(0, 200)}`);
  }

  // #426: streamed with a cap. Browserless is our vendor, but the PDF's size
  // is caller-shaped (it renders the caller's page/markup), so an unbounded
  // read let one request buffer an arbitrarily large render. 32 MiB is far
  // above any real page PDF; the refusal names the input the caller controls.
  const buffer = await readBodyWithLimit(
    response,
    MAX_RENDERED_PDF_BYTES,
    url ? "url" : "html",
    "a page whose rendered PDF is",
  );
  const base64 = buffer.toString("base64");

  return {
    output: {
      base64_pdf: base64,
      content_type: "application/pdf",
      size_bytes: buffer.length,
      paper_size: paperSize,
      landscape,
    },
    provenance: { source: "browserless", fetched_at: new Date().toISOString() },
  };
});
