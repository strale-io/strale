/**
 * Jina Reader API client — converts URLs to markdown via r.jina.ai.
 *
 * Free tier: 20 RPM without API key, 200 RPM with free key.
 * Handles JavaScript rendering and content extraction in a single call.
 * Middle tier between plain-fetch and Browserless.
 *
 * F-0-006: Jina fetches the target URL from its own network, so our
 * safeFetch/undici dispatcher can't protect that outbound call. The
 * only layer we own is refusing to forward — validateUrl runs on the
 * target URL before the Jina request is built. Every caller
 * (url-to-markdown, web-provider, …) inherits this automatically.
 */

import { validateUrl } from "../../lib/url-validator.js";
import { readPageHtml } from "./image-limits.js";

export interface JinaResult {
  markdown: string;
  title: string;
  fetchTimeMs: number;
}

const JINA_TIMEOUT_MS = 15000;

/**
 * Fetch a URL's content as markdown using Jina Reader.
 * Returns null if Jina fails — caller should fall through to next provider.
 * Throws (doesn't return null) if the URL is refused by `validateUrl` —
 * the caller should surface that as the actual error, not fall through.
 */
export async function fetchViaJina(url: string): Promise<JinaResult | null> {
  await validateUrl(url);
  const jinaUrl = `https://r.jina.ai/${url}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-No-Cache": "true",
  };

  const apiKey = process.env.JINA_API_KEY;
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const start = Date.now();

  try {
    const response = await fetch(jinaUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
    });

    const fetchTimeMs = Date.now() - start;

    if (!response.ok) return null;

    // #428 round-2 review: this is a SECOND Jina path, parallel to
    // web-provider's tier 2 and reached with a caller-supplied URL, and it
    // buffered the whole response with `.json()` — worse than `.text()`, since
    // the parse allocates again on top of the buffered body. Bound the bytes
    // first, then parse the bounded string.
    const raw = await readPageHtml(response, "url");
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Same outcome the old `.json()` rejection produced: fall through to the
      // caller's other strategies rather than failing the whole capability.
      return null;
    }

    const nested = data?.data as Record<string, unknown> | undefined;
    const content = ((nested?.content ?? data?.content) as string) ?? "";
    const title = ((nested?.title ?? data?.title) as string) ?? "";

    if (!content || content.length < 50) return null;

    return {
      markdown: content.slice(0, 50000),
      title,
      fetchTimeMs,
    };
  } catch {
    return null;
  }
}
