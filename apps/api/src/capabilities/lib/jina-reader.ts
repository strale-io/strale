/**
 * Jina Reader API client — converts URLs to markdown via r.jina.ai.
 *
 * Free tier: 20 RPM without API key, 200 RPM with free key.
 * Handles JavaScript rendering and content extraction in a single call.
 * Middle tier between plain-fetch and Browserless.
 */

export interface JinaResult {
  markdown: string;
  title: string;
  fetchTimeMs: number;
}

const JINA_TIMEOUT_MS = 15000;

/**
 * Fetch a URL's content as markdown using Jina Reader.
 * Returns null if Jina fails — caller should fall through to next provider.
 */
export async function fetchViaJina(url: string): Promise<JinaResult | null> {
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

    const data = (await response.json()) as Record<string, unknown>;

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
