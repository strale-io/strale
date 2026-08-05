import { registerCapability, type CapabilityInput } from "./index.js";
import { getBrowserlessConfig } from "./lib/browserless-extract.js";
import { buildBrowserlessRequestUrl } from "../lib/browserless-launch.js";
import { validateUrl } from "../lib/url-validator.js";

/**
 * Normalize the `wait_for` input into a Browserless wait directive.
 *
 * A number — or a numeric-looking string such as `"3"` — means "wait N
 * seconds" and maps to `waitForTimeout` (ms). A non-numeric string is a CSS
 * selector and maps to `waitForSelector`.
 *
 * Bug this guards (observed 2026-07 in x402 traffic): the previous code sent
 * *any* string down the selector branch, so `wait_for:"3"` became
 * `waitForSelector{selector:"3"}` — a bogus selector. Best case Browserless
 * waits the full selector timeout and screenshots nothing extra; at the time
 * the hosted instance rejected it outright with HTTP 400. Only a real JS
 * `number` ever reached the intended timeout path.
 *
 * Seconds are clamped to [0, 30] (the executor's own abort budget is 40s).
 */
export function normalizeWaitFor(
  raw: unknown,
): { waitForTimeout: number } | { waitForSelector: { selector: string; timeout: number } } | null {
  let seconds: number | undefined;
  let selector: string | undefined;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    seconds = raw;
  } else if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) seconds = Number(s);
    else selector = s;
  }

  if (seconds !== undefined) {
    const clamped = Math.min(Math.max(seconds, 0), 30);
    return { waitForTimeout: Math.round(clamped * 1000) };
  }
  if (selector) {
    return { waitForSelector: { selector, timeout: 10000 } };
  }
  return null;
}

registerCapability("screenshot-url", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullPage = input.full_page !== false;
  const viewportWidth = (input.viewport_width as number) ?? 1280;
  const viewportHeight = (input.viewport_height as number) ?? 800;
  const waitDirective = normalizeWaitFor(input.wait_for);

  // F-0-006: Browserless fetches the URL from its own network. validateUrl
  // is the only layer we own — refuse private-IP / bad-scheme before forwarding.
  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  await validateUrl(fullUrl);

  const { url: blessUrl, key } = getBrowserlessConfig();
  // buildBrowserlessRequestUrl appends ?launch= per-request, required by
  // Browserless v2 (LAUNCH_ARGS env var is deprecated). See lib/browserless-launch.ts.
  const endpoint = buildBrowserlessRequestUrl(blessUrl, "/screenshot", key);

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

  if (waitDirective) {
    Object.assign(bodyObj, waitDirective);
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
