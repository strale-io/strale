import { registerCapability, type CapabilityInput } from "./index.js";
import { validateUrl } from "../lib/url-validator.js";

registerCapability("base64-encode-url", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  await validateUrl(fullUrl);

  const response = await fetch(fullUrl, {
    headers: { "User-Agent": "Strale/1.0 (encoder; admin@strale.io)" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} from ${fullUrl}.`);

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const buffer = Buffer.from(await response.arrayBuffer());
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
