import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Tech Stack Detection — identify technologies used by a website.
 *
 * Analyzes HTTP response headers, HTML meta tags, script sources,
 * and link elements to detect CMS, frameworks, analytics, CDN,
 * payment providers, and other technologies.
 *
 * No external API needed, no LLM, no Browserless — direct HTTP
 * fetch + pattern matching. Zero external cost.
 */

interface TechMatch {
  name: string;
  category: string;
  confidence: "high" | "medium" | "low";
  evidence: string;
}

const HEADER_RULES: Array<{ header: string; pattern: RegExp; name: string; category: string }> = [
  { header: "server", pattern: /nginx/i, name: "Nginx", category: "hosting" },
  { header: "server", pattern: /apache/i, name: "Apache", category: "hosting" },
  { header: "server", pattern: /cloudflare/i, name: "Cloudflare", category: "cdn" },
  { header: "server", pattern: /microsoft-iis/i, name: "Microsoft IIS", category: "hosting" },
  { header: "server", pattern: /vercel/i, name: "Vercel", category: "hosting" },
  { header: "server", pattern: /netlify/i, name: "Netlify", category: "hosting" },
  { header: "x-powered-by", pattern: /express/i, name: "Express.js", category: "framework" },
  { header: "x-powered-by", pattern: /next\.js/i, name: "Next.js", category: "framework" },
  { header: "x-powered-by", pattern: /php/i, name: "PHP", category: "framework" },
  { header: "x-powered-by", pattern: /asp\.net/i, name: "ASP.NET", category: "framework" },
  { header: "cf-ray", pattern: /.+/, name: "Cloudflare", category: "cdn" },
  { header: "x-amz-cf-id", pattern: /.+/, name: "Amazon CloudFront", category: "cdn" },
  { header: "x-fastly-request-id", pattern: /.+/, name: "Fastly", category: "cdn" },
  { header: "x-vercel-id", pattern: /.+/, name: "Vercel", category: "hosting" },
  { header: "x-netlify-request-id", pattern: /.+/, name: "Netlify", category: "hosting" },
  { header: "strict-transport-security", pattern: /.+/, name: "HSTS", category: "security" },
];

const HTML_RULES: Array<{ pattern: RegExp; name: string; category: string; confidence: "high" | "medium" | "low" }> = [
  // Analytics
  { pattern: /google-analytics\.com|gtag\(|googletagmanager\.com/i, name: "Google Analytics", category: "analytics", confidence: "high" },
  { pattern: /hotjar\.com/i, name: "Hotjar", category: "analytics", confidence: "high" },
  { pattern: /segment\.com\/analytics/i, name: "Segment", category: "analytics", confidence: "high" },
  { pattern: /mixpanel\.com/i, name: "Mixpanel", category: "analytics", confidence: "high" },
  { pattern: /plausible\.io/i, name: "Plausible", category: "analytics", confidence: "high" },
  { pattern: /amplitude\.com/i, name: "Amplitude", category: "analytics", confidence: "high" },
  // CMS / Ecommerce
  { pattern: /wp-content|wp-includes/i, name: "WordPress", category: "cms", confidence: "high" },
  { pattern: /cdn\.shopify\.com/i, name: "Shopify", category: "ecommerce", confidence: "high" },
  { pattern: /squarespace-cdn|squarespace\.com/i, name: "Squarespace", category: "cms", confidence: "high" },
  { pattern: /wixstatic\.com|wix\.com/i, name: "Wix", category: "cms", confidence: "high" },
  { pattern: /webflow\.com/i, name: "Webflow", category: "cms", confidence: "high" },
  { pattern: /hubspot\.com|hubspot\.net/i, name: "HubSpot", category: "marketing", confidence: "high" },
  // Frameworks
  { pattern: /_next\/static|__next/i, name: "Next.js", category: "framework", confidence: "high" },
  { pattern: /_nuxt\/|__nuxt/i, name: "Nuxt.js", category: "framework", confidence: "high" },
  { pattern: /gatsby-/i, name: "Gatsby", category: "framework", confidence: "medium" },
  { pattern: /ng-version/i, name: "Angular", category: "framework", confidence: "high" },
  // Payment
  { pattern: /js\.stripe\.com/i, name: "Stripe", category: "payment", confidence: "high" },
  { pattern: /paypal\.com\/sdk/i, name: "PayPal", category: "payment", confidence: "high" },
  // Marketing / Chat
  { pattern: /widget\.intercom\.io/i, name: "Intercom", category: "marketing", confidence: "high" },
  { pattern: /js\.driftt\.com/i, name: "Drift", category: "marketing", confidence: "high" },
  { pattern: /client\.crisp\.chat/i, name: "Crisp", category: "marketing", confidence: "high" },
  { pattern: /static\.zdassets\.com|zendesk/i, name: "Zendesk", category: "marketing", confidence: "high" },
  { pattern: /mktdns\.com|marketo/i, name: "Marketo", category: "marketing", confidence: "high" },
  { pattern: /pardot\.com/i, name: "Pardot", category: "marketing", confidence: "high" },
  { pattern: /cdn\.optimizely\.com/i, name: "Optimizely", category: "marketing", confidence: "high" },
  // Monitoring
  { pattern: /sentry\.io|browser\.sentry-cdn/i, name: "Sentry", category: "monitoring", confidence: "high" },
  { pattern: /datadoghq\.com/i, name: "Datadog", category: "monitoring", confidence: "high" },
  { pattern: /newrelic\.com/i, name: "New Relic", category: "monitoring", confidence: "high" },
  // Auth
  { pattern: /auth0\.com/i, name: "Auth0", category: "security", confidence: "high" },
  // CSS
  { pattern: /tailwindcss|tailwind/i, name: "Tailwind CSS", category: "css", confidence: "medium" },
  { pattern: /bootstrap\.min|bootstrap\.css/i, name: "Bootstrap", category: "css", confidence: "high" },
];

registerCapability("tech-stack-detect", async (input: CapabilityInput) => {
  const url = (input.url as string)?.trim() ?? "";
  const domain = (input.domain as string)?.trim() ?? "";
  const task = (input.task as string)?.trim() ?? "";

  const rawTarget = url || domain || task;
  if (!rawTarget || rawTarget.length < 3) {
    throw new Error("Provide 'url' (e.g. https://stripe.com) or 'domain' (e.g. stripe.com) to detect the technology stack.");
  }
  const target = rawTarget.startsWith("http") ? rawTarget : `https://${rawTarget}`;

  const resp = await fetch(target, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });

  if (!resp.ok) {
    throw new Error(`Could not fetch ${target} (HTTP ${resp.status}). Check the URL is correct and publicly accessible.`);
  }

  const html = await resp.text();
  const technologies: TechMatch[] = [];
  const seen = new Set<string>();

  // HTTP headers
  for (const rule of HEADER_RULES) {
    const value = resp.headers.get(rule.header);
    if (value && rule.pattern.test(value) && !seen.has(rule.name)) {
      seen.add(rule.name);
      technologies.push({
        name: rule.name,
        category: rule.category,
        confidence: "high",
        evidence: `HTTP header ${rule.header}`,
      });
    }
  }

  // HTML patterns (first 200KB)
  const htmlSlice = html.slice(0, 200000);
  for (const rule of HTML_RULES) {
    if (rule.pattern.test(htmlSlice) && !seen.has(rule.name)) {
      seen.add(rule.name);
      technologies.push({
        name: rule.name,
        category: rule.category,
        confidence: rule.confidence,
        evidence: "HTML content pattern",
      });
    }
  }

  // Meta generator
  const genMatch = htmlSlice.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i);
  if (genMatch) {
    const genName = genMatch[1].trim();
    if (!seen.has(genName)) {
      seen.add(genName);
      technologies.push({ name: genName, category: "cms", confidence: "high", evidence: "meta generator tag" });
    }
  }

  // Group by category
  const byCategory: Record<string, string[]> = {};
  for (const tech of technologies) {
    if (!byCategory[tech.category]) byCategory[tech.category] = [];
    byCategory[tech.category].push(tech.name);
  }

  return {
    output: {
      url: resp.url,
      technologies_detected: technologies.length,
      technologies,
      by_category: byCategory,
      signals: {
        has_analytics: (byCategory.analytics || []).length > 0,
        has_chat_widget: technologies.some(t => ["Intercom", "Drift", "Crisp", "Zendesk"].includes(t.name)),
        has_payment_processing: (byCategory.payment || []).length > 0,
        has_marketing_automation: technologies.some(t => ["HubSpot", "Marketo", "Pardot", "Mailchimp", "Optimizely"].includes(t.name)),
        has_error_monitoring: (byCategory.monitoring || []).length > 0,
      },
    },
    provenance: {
      source: "tech-stack-detect:algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
