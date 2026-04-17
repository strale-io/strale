import { registerCapability, type CapabilityInput } from "./index.js";
import { getBrowserlessConfig } from "./lib/browserless-extract.js";
import { validateUrl } from "../lib/url-validator.js";

registerCapability("html-to-pdf", async (input: CapabilityInput) => {
  const html = (input.html as string) ?? undefined;
  const url = (input.url as string) ?? undefined;

  if (!html && !url) throw new Error("'html' or 'url' is required.");

  const paperSize = ((input.paper_size as string) ?? "A4").toUpperCase();
  const landscape = input.landscape === true;
  const margins = (input.margins as Record<string, string>) ?? { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" };

  const { url: blessUrl, key } = getBrowserlessConfig();
  const endpoint = `${blessUrl}/pdf?token=${key}`;

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
    bodyObj.url = fullUrl;
    bodyObj.gotoOptions = { waitUntil: "networkidle0", timeout: 25000 };
  } else {
    bodyObj.html = html;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
    signal: AbortSignal.timeout(40000),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`Browserless PDF returned HTTP ${response.status}: ${err.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
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
