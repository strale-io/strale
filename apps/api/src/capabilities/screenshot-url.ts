import { registerCapability, type CapabilityInput } from "./index.js";
import { getBrowserlessConfig } from "./lib/browserless-extract.js";
import { validateUrl } from "../lib/url-validator.js";

registerCapability("screenshot-url", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullPage = input.full_page !== false;
  const viewportWidth = (input.viewport_width as number) ?? 1280;
  const viewportHeight = (input.viewport_height as number) ?? 800;
  const waitFor = (input.wait_for as string | number) ?? undefined;

  // F-0-006: Browserless fetches the URL from its own network. validateUrl
  // is the only layer we own — refuse private-IP / bad-scheme before forwarding.
  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  await validateUrl(fullUrl);

  const { url: blessUrl, key } = getBrowserlessConfig();
  const endpoint = `${blessUrl}/screenshot?token=${key}`;

  const gotoOptions: Record<string, unknown> = { waitUntil: "networkidle0", timeout: 25000 };

  const bodyObj: Record<string, unknown> = {
    url: fullUrl,
    gotoOptions,
    options: {
      fullPage,
      type: "png",
    },
    viewport: { width: viewportWidth, height: viewportHeight },
  };

  if (typeof waitFor === "number") {
    bodyObj.waitForTimeout = waitFor * 1000;
  } else if (typeof waitFor === "string") {
    bodyObj.waitForSelector = { selector: waitFor, timeout: 10000 };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
    signal: AbortSignal.timeout(40000),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`Browserless screenshot returned HTTP ${response.status}: ${err.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const base64 = buffer.toString("base64");

  return {
    output: {
      base64_png: base64,
      content_type: "image/png",
      size_bytes: buffer.length,
      viewport: { width: viewportWidth, height: viewportHeight },
      full_page: fullPage,
      url: bodyObj.url,
    },
    provenance: { source: "browserless", fetched_at: new Date().toISOString() },
  };
});
