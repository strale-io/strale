import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("tech-stack-detect", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.domain as string) ?? (input.task as string) ?? "").trim();
  if (!url) {
    throw new Error("'url' or 'domain' is required. Provide a website URL (e.g. https://example.com).");
  }

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const html = await fetchRenderedHtml(fullUrl);

  // Extract signals from raw HTML (before stripping tags)
  const signals: string[] = [];

  // Script sources
  const scriptMatches = html.match(/<script[^>]*src="([^"]+)"/gi) ?? [];
  signals.push(...scriptMatches.map((m) => m.match(/src="([^"]+)"/)?.[1] ?? "").filter(Boolean));

  // Link stylesheets
  const linkMatches = html.match(/<link[^>]*href="([^"]+)"/gi) ?? [];
  signals.push(...linkMatches.map((m) => m.match(/href="([^"]+)"/)?.[1] ?? "").filter(Boolean));

  // Meta generators
  const metaGen = html.match(/<meta[^>]*name=["']generator["'][^>]*content=["']([^"']+)/i);
  if (metaGen) signals.push(`generator: ${metaGen[1]}`);

  // Data attributes
  const dataAttrs = html.match(/data-(?:reactroot|react-helmet|nextjs|nuxt|svelte|astro|gatsby|vue)[^=]*/gi) ?? [];
  signals.push(...dataAttrs);

  // ID attributes
  if (html.includes("__next")) signals.push("__next (Next.js)");
  if (html.includes("__nuxt")) signals.push("__nuxt (Nuxt)");
  if (html.includes("__gatsby")) signals.push("__gatsby (Gatsby)");

  // Use Claude to analyze signals and HTML structure
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const truncatedHtml = html.slice(0, 8000);
  const signalText = signals.slice(0, 50).join("\n");

  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `Analyze this website's technology stack. Return ONLY valid JSON.

URL: ${fullUrl}

Script/link signals:
${signalText}

HTML head excerpt:
${truncatedHtml.slice(0, 4000)}

Return JSON:
{
  "frontend_framework": "string or null (React, Vue, Angular, Svelte, etc.)",
  "meta_framework": "string or null (Next.js, Nuxt, Gatsby, Astro, SvelteKit, etc.)",
  "css_framework": "string or null (Tailwind, Bootstrap, Material UI, etc.)",
  "cms": "string or null (WordPress, Shopify, Webflow, etc.)",
  "analytics": ["Google Analytics", "Hotjar", etc.],
  "hosting": "string or null (Vercel, Netlify, AWS, etc.)",
  "cdn": "string or null (Cloudflare, Fastly, etc.)",
  "other_technologies": ["list of other detected tech"],
  "confidence": "high/medium/low"
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to analyze tech stack.");

  const output = JSON.parse(jsonMatch[0]);
  output.url = fullUrl;

  return {
    output,
    provenance: { source: "html-analysis", fetched_at: new Date().toISOString() },
  };
});
