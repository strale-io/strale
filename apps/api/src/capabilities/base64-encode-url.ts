import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch } from "../lib/safe-fetch.js";
import { validateUrl } from "../lib/url-validator.js";
import { MAX_DECODED_DOCUMENT_BYTES, readBodyWithLimit } from "../lib/resource-limits.js";

registerCapability("base64-encode-url", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  await validateUrl(fullUrl);

  const response = await safeFetch(fullUrl, {
    headers: { "User-Agent": "Strale/1.0 (encoder; admin@strale.io)" },
    // safeFetch follows up to 3 hops with per-hop re-validation
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} from ${fullUrl}.`);

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  // #426: streamed with a cap, not arrayBuffer() — this capability fetches
  // ANY caller URL, so an unbounded read let one call buffer an arbitrarily
  // large remote file. 8 MiB is the platform's document-class input cap.
  const buffer = await readBodyWithLimit(response, MAX_DECODED_DOCUMENT_BYTES, "url", "a fetched file of");
  const base64 = buffer.toString("base64");

  return {
    output: {
      base64,
      content_type: contentType,
      size_bytes: buffer.length,
      url: fullUrl,
      data_uri: `data:${contentType};base64,${base64}`,
    },
    provenance: { source: "http-get", fetched_at: new Date().toISOString() },
  };
});
