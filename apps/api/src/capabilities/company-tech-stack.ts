import { createAnthropicClient } from "../lib/anthropic-client.js";
import { inputRefusal } from "../lib/capability-refusal.js";
import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { STRALE_USER_AGENT } from "../lib/site-access.js";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";
import type Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";
import { detectTechnologies, extractCookieNames, type TechMatch } from "./lib/tech-detect.js";
import { lookupTechDns, registrableGuess } from "./lib/tech-dns.js";
import { normalizeTechName } from "./lib/tech-signatures.js";

const COVERAGE_NOTE =
  "Detected from the rendered homepage, its response headers and public DNS records (MX, TXT, NS, CNAME), " +
  "with an AI summary of the same material. It lists what those show, not every technology the company uses.";

/** The first deterministic detection in a category, for filling a summary field the model left empty. */
function firstIn(detected: TechMatch[], ...categories: string[]): string | null {
  return detected.find((t) => categories.includes(t.category))?.name ?? null;
}

registerCapability("company-tech-stack", async (input: CapabilityInput) => {
  const domain = ((input.domain as string) ?? (input.url as string) ?? (input.task as string) ?? "").trim();
  if (!domain) throw inputRefusal("'domain' is required.", "domain", "Send 'domain' as a DNS hostname such as example.com.");

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const fullUrl = `https://${cleanDomain}`;

  // Fetch HTML + headers in parallel with DNS
  const [html, dnsResults] = await Promise.all([
    fetchRenderedHtml(fullUrl),
    lookupTechDns({
      domain: registrableGuess(cleanDomain.replace(/^www\./, "")),
      cnameHosts: [cleanDomain],
      includeA: true,
    }),
  ]);

  // Extract HTTP headers by doing a HEAD request. Runs only after
  // fetchRenderedHtml succeeded, i.e. after its robots.txt and block checks
  // passed (DEC-20261023-A); identifies as Strale like every other route.
  let headers: Record<string, string> = {};
  let cookieNames: string[] = [];
  try {
    const headRes = await safeFetch(fullUrl, {
      method: "HEAD",
      headers: { "User-Agent": STRALE_USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    await discardBody(headRes, "company-tech-stack: HEAD");
    headRes.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    cookieNames = extractCookieNames(headRes.headers.getSetCookie?.() ?? []);
  } catch { /* ignore */ }

  // Signature matching on the same material (lib/tech-signatures.ts). It is
  // deterministic and carries versions; the model below adds a summary and
  // anything the signatures do not know.
  const detected = detectTechnologies({ headers, cookieNames, html, dns: dnsResults });

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

  const dnsRecords = {
    a: dnsResults.a,
    mx: dnsResults.mx,
    txt: dnsResults.txt,
    cname: dnsResults.cname,
    ns: dnsResults.ns,
  };

  const client = createAnthropicClient({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 1000,
    prompt: `Analyze this website's full technology stack. Return ONLY valid JSON.

Domain: ${cleanDomain}
Detected framework markers: ${markers.join(", ") || "none"}
HTTP header signals: ${headerSignals.join(", ") || "none"}
DNS records: ${JSON.stringify(dnsRecords).slice(0, 700)}
Already identified by signature matching (do not repeat these in detected_technologies): ${detected.map((t) => (t.version ? `${t.name} ${t.version}` : t.name)).join(", ") || "none"}

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
    truncationGuidance: "This domain's page yielded too much signal for one call — this is unusual and likely means the target page is unusually large.",
    parseFailureError: () => new Error("Failed to analyze tech stack."),
  });

  // detected_technologies: signature matches first (with versions), then
  // whatever else the model named that they do not already cover.
  const known = new Set(detected.map((t) => normalizeTechName(t.name)));
  const modelTechs = (Array.isArray(output.detected_technologies) ? output.detected_technologies : [])
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && typeof (t as Record<string, unknown>).name === "string")
    .filter((t) => !known.has(normalizeTechName(String(t.name))))
    .map((t) => ({
      name: String(t.name),
      category: typeof t.category === "string" ? t.category : "other",
      confidence: typeof t.confidence === "string" ? t.confidence : "low",
      version: typeof t.version === "string" ? t.version : null,
      evidence: "AI analysis of the page excerpt and signals",
    }));
  output.detected_technologies = [
    ...detected.map((t) => ({ name: t.name, category: t.category, confidence: t.confidence, version: t.version, evidence: t.evidence })),
    ...modelTechs,
  ];

  // Summary fields the model left empty are filled from signature matches.
  const analytics = new Set<string>(Array.isArray(output.analytics) ? output.analytics.map(String) : []);
  for (const t of detected) if (t.category === "analytics") analytics.add(t.name);
  output.analytics = [...analytics];
  output.cdn ||= firstIn(detected, "cdn");
  output.payment_processor ||= firstIn(detected, "payment");
  output.email_provider ||= firstIn(detected, "email");
  output.chat_widget ||= firstIn(detected, "chat");

  output.dns_records = dnsRecords;
  output.http_headers_analyzed = headerSignals;
  output.dns_status = {
    status: dnsResults.overall,
    failed_lookups: dnsResults.failures.map((f) => f.type),
  };
  output.warnings = dnsResults.overall === "unavailable" || dnsResults.overall === "partial"
    ? [
        `Public DNS lookups failed (${dnsResults.failures.map((f) => `${f.type}: ${f.code}`).join(", ")}). ` +
        "Technologies that only DNS shows (email provider, DNS host, hosting by CNAME) may be missing from this result.",
      ]
    : [];
  output.coverage_note = COVERAGE_NOTE;

  return {
    output,
    provenance: { source: "html-analysis", fetched_at: new Date().toISOString() },
  };
});
