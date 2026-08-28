import { registerCapability, type CapabilityInput } from "./index.js";
import { assertTargetAllowed } from "./lib/tos-blocklist.js";
import { getBrowserlessConfig } from "./lib/browserless-extract.js";
import { buildBrowserlessRequestUrl } from "../lib/browserless-launch.js";
import { validateUrl } from "../lib/url-validator.js";
import { logWarn } from "../lib/log.js";
import { browserlessFetch } from "../lib/metered-vendor-fetch.js";
import { MAX_RENDERED_SCREENSHOT_BYTES, readBodyWithLimit } from "./lib/image-limits.js";

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

/**
 * Downgrade a v2 wait directive to the Browserless v1 `waitFor` key.
 *
 * The production chromium service is pinned to Browserless v1
 * (`browserless/chrome:1.61.1`, see apps/api/railway-config.md), whose Joi
 * schema predates the discrete v2 keys — it rejects both `waitForTimeout`
 * and `waitForSelector` with HTTP 400 `"...is not allowed"`. v1 takes a
 * single `waitFor`, overloaded by JS type. The SaaS endpoint used in local
 * dev speaks v2 and conversely rejects `waitFor`, so the executor probes with
 * one dialect, retries with the other on the rejection, and memoizes the
 * winner per host (see waitDialectByHost) so only the first call per process
 * pays the probe.
 *
 * A selector MUST be sent as the object form, never a bare string. v1's
 * handler (`functions/screenshot.js:144-162` at tag v1.61.1) branches on
 * typeof: an object destructures to `page.waitForSelector(selector, options)`,
 * but a *string* is interpolated unescaped into
 * `page.evaluate('document.createDocumentFragment().querySelector("<raw>")')`
 * and, if that probe fails, executed as `page.evaluate('(<raw>)()')` — i.e.
 * caller-supplied JS running inside the chromium container, on Railway's
 * private network, which is exactly what the validateUrl guard below exists
 * to prevent. The object form also keeps the selector timeout, which a bare
 * string has no slot for.
 */
export function toV1WaitFor(
  directive: NonNullable<ReturnType<typeof normalizeWaitFor>>,
): { waitFor: number | { selector: string; timeout: number } } {
  if ("waitForTimeout" in directive) return { waitFor: directive.waitForTimeout };
  return { waitFor: { ...directive.waitForSelector } };
}

/**
 * Does this 400 mean "you sent the wrong dialect's wait key"?
 *
 * The two versions reject unknown keys with different validators, and both
 * strings below were captured from live endpoints (2026-08-05) rather than
 * assumed:
 *   v1 (Joi)  → `[{"message":"\"waitForTimeout\" is not allowed",...}]`
 *   v2 (ajv)  → `POST Body validation failed: must NOT have additional properties`
 *
 * The v2 string doesn't name the offending key, but every other property this
 * executor sends (url, gotoOptions, options, viewport) is fixed and accepted
 * by both versions, so the wait key is the only thing it can be referring to.
 * Matching only the Joi form would strand a process that had memoized v1
 * against a host later upgraded to v2: no retry would fire and every
 * wait_for call would hard-fail until restart.
 */
export function isWaitKeyRejection(status: number, errBody: string): boolean {
  if (status !== 400) return false;
  // v1: the key sits inside a JSON string value, so its quotes arrive
  // backslash-escaped in the raw body (`\"waitForTimeout\"`).
  if (/\\?"waitFor(Timeout|Selector)?\\?" is not allowed/.test(errBody)) return true;
  // v2: ajv's additionalProperties failure.
  return /must NOT have additional properties/i.test(errBody);
}

/**
 * Which wait dialect each Browserless host speaks, learned from the first
 * successful wait-carrying call. The dialect is a static property of the
 * configured endpoint (env-driven, fixed for the process lifetime), so
 * without this memo the pinned-v1 prod service would pay the probe 400 +
 * retry on every wait_for call forever. Exported for test reset only.
 */
export const waitDialectByHost = new Map<string, "v1" | "v2">();

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
  // Per-source ToS policy gates every arbitrary-URL fetch path (P1 review, 2026-08-12).
  assertTargetAllowed(fullUrl);
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

  const shoot = (waitShape: Record<string, unknown> | null) =>
    browserlessFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(waitShape ? { ...bodyObj, ...waitShape } : bodyObj),
      signal: AbortSignal.timeout(40000),
    });

  const throwBrowserlessError: (status: number, err: string, note?: string) => never = (
    status,
    err,
    note,
  ) => {
    throw new Error(
      `Browserless screenshot returned HTTP ${status}${note ? ` (${note})` : ""}: ${err.slice(0, 200)}`,
    );
  };

  let response: Response;
  if (waitDirective) {
    const host = new URL(endpoint).host;
    const shapeFor = (d: "v1" | "v2") => (d === "v1" ? toV1WaitFor(waitDirective) : waitDirective);
    let dialect = waitDialectByHost.get(host) ?? "v2";

    response = await shoot(shapeFor(dialect));
    if (!response.ok) {
      const err = await response.text().catch(() => "");
      if (!isWaitKeyRejection(response.status, err)) throwBrowserlessError(response.status, err);
      // Endpoint speaks the other dialect (see toV1WaitFor) — retry with it.
      const rejected = dialect;
      dialect = dialect === "v1" ? "v2" : "v1";
      // The 2026-07 incident was a *silent* per-call 400 that ran for a month.
      // Log the flip so a future dialect change leaves a trace before it
      // becomes a customer-visible failure again.
      logWarn(
        "screenshot-wait-dialect-fallback",
        `Browserless host rejected ${rejected} wait keys — retrying with ${dialect}`,
        { browserless_host: host, rejected_dialect: rejected, retrying_with: dialect },
      );
      response = await shoot(shapeFor(dialect));
      if (!response.ok) {
        const retryErr = await response.text().catch(() => "");
        throwBrowserlessError(
          response.status,
          retryErr,
          "target rejected both supported wait dialects; try omitting wait_for",
        );
      }
    }
    waitDialectByHost.set(host, dialect);
  } else {
    response = await shoot(null);
  }

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throwBrowserlessError(response.status, err);
  }

  // #426: streamed with a cap. The PNG comes from our Browserless, but its
  // size is caller-shaped — full_page defaults to true and the viewport is
  // caller-chosen, so a long page renders a very large screenshot. 32 MiB is
  // ~25x the largest render ever observed in production.
  const buffer = await readBodyWithLimit(
    response,
    MAX_RENDERED_SCREENSHOT_BYTES,
    "url",
    "a page whose screenshot renders to",
  );
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
