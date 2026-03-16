import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";

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
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (oembedRes.ok) {
      const meta = await oembedRes.json() as Record<string, string>;
      title = meta.title ?? "";
      channel = meta.author_name ?? "";
    }
  } catch { /* ignore */ }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Summarize this YouTube video transcript. Return ONLY valid JSON.

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
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to summarize video.");

  const output = JSON.parse(jsonMatch[0]);
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

async function fetchTranscript(videoId: string): Promise<string | null> {
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Try direct fetch first (works from residential IPs), then Browserless
  let pageHtml: string | null = null;

  try {
    const pageRes = await fetch(ytUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(10000),
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      if (html.includes('"captions"')) pageHtml = html;
    }
  } catch { /* fall through to Browserless */ }

  // Fallback: use Browserless (EU West) which renders full JS and gets captions
  if (!pageHtml) {
    try {
      const html = await fetchRenderedHtml(ytUrl);
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
  const captionRes = await fetch(captionUrl, { signal: AbortSignal.timeout(10000) });
  if (!captionRes.ok) return null;

  const xml = await captionRes.text();
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
