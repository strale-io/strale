import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import {
  MAX_FETCHED_API_RESPONSE_BYTES,
  readJsonWithLimit,
  readPageHtml,
  readTextWithLimit,
} from "../lib/resource-limits.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { STRALE_USER_AGENT, SiteAccessRefusedError, isBlockStatus } from "../lib/site-access.js";
import { assertRobotsAllowed } from "../lib/robots-txt.js";
import { looksLikeJsChallenge } from "./lib/web-provider.js";
import Anthropic from "@anthropic-ai/sdk";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("youtube-summarize", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.youtube_url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required. Provide a YouTube URL.");

  // Extract video ID
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Could not extract YouTube video ID from URL.");

  // Fetch transcript
  const transcript = await fetchTranscript(videoId);
  if (!transcript) throw new Error("Could not fetch transcript. The video may not have captions available.");

  // Fetch video metadata via oEmbed
  let title = "", channel = "";
  try {
    // unguarded-fetch-ok: fixed youtube.com oembed endpoint; video id regex-extracted
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (oembedRes.ok) {
      const meta = await readJsonWithLimit<Record<string, string>>(
        oembedRes,
        MAX_FETCHED_API_RESPONSE_BYTES,
        "url",
      );
      title = meta.title ?? "";
      channel = meta.author_name ?? "";
    }
  } catch { /* ignore */ }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 1500,
    prompt: `Summarize this YouTube video transcript. Return ONLY valid JSON.

Title: ${title || "Unknown"}
Channel: ${channel || "Unknown"}

Transcript:
"""
${transcript.slice(0, 12000)}
"""

Return JSON:
{
  "title": "${title || "extracted title"}",
  "channel": "${channel || "extracted channel"}",
  "summary": "3-5 sentence summary",
  "key_points": ["main takeaways"],
  "topics": ["topic categories"],
  "timestamps_of_interest": [
    {"time": "MM:SS", "topic": "what's discussed"}
  ],
  "sentiment": "informative/entertaining/educational/promotional/opinion",
  "recommended_for": "who would benefit from watching"
}`,
    truncationGuidance: "This video's transcript produced more content than fits in one call.",
    parseFailureError: () => new Error("Failed to summarize video."),
  });
  output.video_id = videoId;
  output.video_url = `https://www.youtube.com/watch?v=${videoId}`;
  output.transcript_length = transcript.length;

  return {
    output,
    provenance: { source: "youtube-transcript", fetched_at: new Date().toISOString() },
  };
});

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const m = url.match(pattern);
    if (m) return m[1];
  }
  return null;
}

/** YouTube's soft block: a 200 watch page asking to sign in to prove you are not a bot. */
export function looksLikeYouTubeBotCheck(html: string): boolean {
  return /confirm you(?:'|\u2019|’)?re not a bot/i.test(html);
}

async function fetchTranscript(videoId: string): Promise<string | null> {
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Try direct fetch first, then Browserless for a page that needs rendering.
  // DEC-20261023-A: if YouTube refuses the direct fetch, rendering the same
  // page in a real browser is retrying a blocked request through another
  // route, so the fallback is skipped. A refusal is any of: robots.txt
  // disallowing the page, HTTP 401/403/407/429, an anti-bot challenge, or
  // YouTube's own soft block — HTTP 200 with "Sign in to confirm you're not a
  // bot" and no captions, which it serves to datacenter IPs.
  let pageHtml: string | null = null;
  let blocked = false;

  try {
    await assertRobotsAllowed(ytUrl);
    const pageRes = await safeFetch(ytUrl, {
      headers: { "User-Agent": STRALE_USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(10000),
    });
    if (pageRes.ok) {
      const html = await readPageHtml(pageRes);
      if (html.includes('"captions"')) pageHtml = html;
      else blocked = looksLikeJsChallenge(html) || looksLikeYouTubeBotCheck(html);
    } else {
      await discardBody(pageRes, `youtube watch page HTTP ${pageRes.status}`);
      blocked = isBlockStatus(pageRes.status);
    }
  } catch (err) {
    // A site-access refusal (robots.txt) is a block; anything else falls
    // through to the render.
    blocked = err instanceof SiteAccessRefusedError;
  }

  // Fallback: Browserless renders full JS and gets captions — only when the
  // direct fetch was not refused.
  if (!pageHtml && !blocked) {
    try {
      const html = await fetchRenderedHtml(ytUrl, { source: "strale" });
      if (html.includes('"captions"') || html.includes('captionTracks')) pageHtml = html;
    } catch { /* both failed */ }
  }

  if (!pageHtml) return null;

  // Extract captions URL from ytInitialPlayerResponse
  const captionsMatch = pageHtml.match(/"captions":\s*(\{.*?"captionTracks":\s*\[.*?\].*?\})/s);
  if (!captionsMatch) return null;

  // Find timedtext URL
  const urlMatch = captionsMatch[0].match(/"baseUrl"\s*:\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/);
  if (!urlMatch) return null;

  const captionUrl = urlMatch[1].replace(/\\u0026/g, "&");
  // unguarded-fetch-ok: captionUrl regex-constrained to youtube.com/api/timedtext
  const captionRes = await fetch(captionUrl, { signal: AbortSignal.timeout(10000) });
  if (!captionRes.ok) return null;

  const xml = await readTextWithLimit(
    captionRes,
    MAX_FETCHED_API_RESPONSE_BYTES,
    "url",
    "a video whose caption track is",
  );
  // Parse XML transcript — extract text content
  const textParts = xml.match(/<text[^>]*>([\s\S]*?)<\/text>/g) ?? [];
  const lines = textParts.map((t) => {
    const content = t.replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n/g, " ").trim();
    return content;
  }).filter(Boolean);

  return lines.join(" ");
}
