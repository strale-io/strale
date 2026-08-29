import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { readPageHtml, ResourceLimitError } from "../lib/resource-limits.js";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("social-post-generate", async (input: CapabilityInput) => {
  const content = ((input.content as string) ?? (input.topic as string) ?? (input.task as string) ?? "").trim();
  const url = (input.url as string)?.trim();
  if (!content && !url) throw new Error("'content' or 'url' is required.");

  const platform = ((input.platform as string) ?? "twitter").toLowerCase().trim();
  const tone = ((input.tone as string) ?? "professional").trim();
  const hashtagCount = Math.min((input.hashtag_count as number) ?? 3, 10);

  // If URL provided, fetch content
  let sourceContent = content;
  if (url && !content) {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    try {
      // F-0-006: safeFetch guards SSRF + DNS-rebinding.
      const res = await safeFetch(fullUrl, {
        headers: { "User-Agent": "Strale/1.0", Accept: "text/html,*/*" },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        let html = await readPageHtml(res);
        html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
        html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
        html = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        sourceContent = html.trim().slice(0, 3000);
      } else {
        // Body unread on the non-2xx path (#434) — cancel it.
        await discardBody(res, "social-post-generate: non-2xx");
      }
    } catch (err) {
      // Terminal, unlike the other fetch failures here (#432). The fallback
      // below hands the model the URL string instead of the page, so
      // swallowing a size refusal would return a confidently-written post
      // about a page nobody read — worse than an error, because it looks
      // like a success.
      if (err instanceof ResourceLimitError) throw err;
      /* fall through */
    }
    if (!sourceContent) sourceContent = `Content from URL: ${url}`;
  }

  const platformLimits: Record<string, number> = {
    twitter: 280, x: 280, linkedin: 3000, instagram: 2200, facebook: 5000, threads: 500,
  };
  const charLimit = platformLimits[platform] ?? 280;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 800,
    prompt: `Generate a social media post. Return ONLY valid JSON.

Content/topic: "${sourceContent}"
Platform: ${platform} (character limit: ${charLimit})
Tone: ${tone}
Hashtag count: ${hashtagCount}

Return JSON:
{
  "post_text": "the post text (within character limit, WITHOUT hashtags)",
  "hashtags": ["relevant", "hashtags"],
  "character_count": <number including hashtags>,
  "platform": "${platform}",
  "thread_version": ${platform === "twitter" || platform === "x" ? '["tweet 1", "tweet 2", "tweet 3"] if content needs a thread, or null' : "null"},
  "engagement_hooks": ["why this post should get engagement"]
}`,
    truncationGuidance: "Provide a shorter content/topic input.",
    parseFailureError: () => new Error("Failed to generate social post."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
