import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";
import * as dns from "node:dns/promises";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("company-tech-stack", async (input: CapabilityInput) => {
  const domain = ((input.domain as string) ?? (input.url as string) ?? (input.task as string) ?? "").trim();
  if (!domain) throw new Error("'domain' is required.");

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const fullUrl = `https://${cleanDomain}`;

  // Fetch HTML + headers in parallel with DNS
  const [html, dnsResults] = await Promise.all([
    fetchRenderedHtml(fullUrl),
    resolveDns(cleanDomain),
  ]);

  // Extract HTTP headers by doing a HEAD request
  let headers: Record<string, string> = {};
  try {
    const headRes = await fetch(fullUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10000) });
    headRes.headers.forEach((v, k) => { headers[k] = v; });
  } catch { /* ignore */ }

  // Extract signals from HTML
  const signals: string[] = [];

  // Script sources
  const scriptSrcs = (html.match(/<script[^>]*src=["']([^"']+)/gi) ?? [])
    .map((m) => m.match(/src=["']([^"']+)/)?.[1] ?? "").filter(Boolean);
  signals.push(...scriptSrcs.slice(0, 30));

  // Link stylesheets
  const linkHrefs = (html.match(/<link[^>]*href=["']([^"']+\.css[^"']*)/gi) ?? [])
    .map((m) => m.match(/href=["']([^"']+)/)?.[1] ?? "").filter(Boolean);
  signals.push(...linkHrefs.slice(0, 15));

  // Meta generator
  const metaGen = html.match(/<meta[^>]*name=["']generator["'][^>]*content=["']([^"']+)/i);
  if (metaGen) signals.push(`generator: ${metaGen[1]}`);

  // Framework markers
  const markers: string[] = [];
  if (html.includes("__next")) markers.push("Next.js");
  if (html.includes("__nuxt")) markers.push("Nuxt");
  if (html.includes("__gatsby")) markers.push("Gatsby");
  if (html.includes("data-reactroot")) markers.push("React");
  if (html.includes("ng-version")) markers.push("Angular");
  if (html.includes("data-svelte")) markers.push("Svelte");
  if (html.includes("data-astro")) markers.push("Astro");

  // Headers analysis
  const headerSignals: string[] = [];
  if (headers["x-powered-by"]) headerSignals.push(`x-powered-by: ${headers["x-powered-by"]}`);
  if (headers["server"]) headerSignals.push(`server: ${headers["server"]}`);
  if (headers["x-vercel-id"]) headerSignals.push("Vercel hosting");
  if (headers["x-netlify"]) headerSignals.push("Netlify hosting");
  if (headers["cf-ray"]) headerSignals.push("Cloudflare CDN");
  if (headers["x-amz-cf-id"]) headerSignals.push("AWS CloudFront CDN");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `Analyze this website's full technology stack. Return ONLY valid JSON.

Domain: ${cleanDomain}
Detected framework markers: ${markers.join(", ") || "none"}
HTTP header signals: ${headerSignals.join(", ") || "none"}
DNS records: ${JSON.stringify(dnsResults).slice(0, 500)}

Script/link sources (sample):
${signals.slice(0, 30).join("\n")}

HTML excerpt (first 4000 chars):
${html.slice(0, 4000)}

Return JSON:
{
  "domain": "${cleanDomain}",
  "frontend_framework": "string or null",
  "meta_framework": "string or null (Next.js, Nuxt, etc.)",
  "css_framework": "string or null",
  "analytics": ["list"],
  "cdn": "string or null",
  "hosting_provider": "string or null",
  "cms": "string or null",
  "payment_processor": "string or null",
  "email_provider": "string or null",
  "chat_widget": "string or null",
  "detected_technologies": [{"name": "tech", "category": "category", "confidence": "high/medium/low"}]
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to analyze tech stack.");

  const output = JSON.parse(jsonMatch[0]);
  output.dns_records = dnsResults;
  output.http_headers_analyzed = headerSignals;

  return {
    output,
    provenance: { source: "html-analysis", fetched_at: new Date().toISOString() },
  };
});

async function resolveDns(domain: string): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  try { results.a = await dns.resolve4(domain); } catch { results.a = []; }
  try { results.mx = await dns.resolveMx(domain); } catch { results.mx = []; }
  try { results.txt = (await dns.resolveTxt(domain)).map((r) => r.join("")); } catch { results.txt = []; }
  try { results.cname = await dns.resolveCname(domain); } catch { results.cname = []; }
  return results;
}
