/**
 * Agent Welcome Mat — GET / and GET /api
 *
 * The single highest-impact Beacon fix: a rich JSON self-description
 * that lets any agent fully understand and navigate the API on first contact.
 *
 * Also serves robots.txt, sitemap.xml, pricing, status, and redirect routes.
 */

import { Hono } from "hono";

export const welcomeRoute = new Hono();

// ─── Welcome JSON ───────────────────────────────────────────────────────────

const WELCOME = {
  // Top-level JSON-LD fields for Beacon structured data detection
  status: "ok",
  "@context": "https://schema.org",
  "@type": "WebAPI",
  name: "Strale API",
  tagline: "The trust layer for AI agents",
  description:
    "250+ independently tested and scored data capabilities across 27 countries. Business data, compliance checks, web scraping, and more — accessible via REST API, MCP, and A2A protocols.",
  version: "1.0.0",

  // Top-level links for Beacon first-contact navigation detection
  links: {
    documentation: "https://strale.dev/docs",
    openapi: "https://api.strale.io/openapi.json",
    pricing: "https://api.strale.io/v1/pricing",
    changelog: "https://strale.dev/changelog",
    status: "https://api.strale.io/status",
    signup: "https://strale.dev/signup",
    mcp_server: "https://api.strale.io/mcp",
    agent_card: "https://api.strale.io/.well-known/agent-card.json",
  },

  endpoints: {
    execute: "POST /v1/do",
    capabilities: "GET /v1/capabilities",
    solutions: "GET /v1/solutions",
    suggest: "POST /v1/suggest",
    register: "POST /v1/auth/register",
    wallet_balance: "GET /v1/wallet/balance",
    wallet_topup: "POST /v1/wallet/topup",
    transactions: "GET /v1/transactions",
    pricing: "GET /v1/pricing",
  },

  discovery: {
    openapi: "https://api.strale.io/openapi.json",
    mcp_server: "https://api.strale.io/mcp",
    mcp_manifest: "https://api.strale.io/.well-known/mcp.json",
    agent_card: "https://api.strale.io/.well-known/agent-card.json",
    ai_catalog: "https://api.strale.io/.well-known/ai-catalog.json",
    llms_txt: "https://api.strale.io/llms.txt",
    health: "https://api.strale.io/health",
  },

  documentation: {
    docs: "https://strale.dev/docs",
    api_reference: "https://strale.dev/api-reference",
    quickstart: "https://strale.dev/docs/quickstart",
    changelog: "https://api.strale.io/changelog",
    status: "https://api.strale.io/status",
  },

  authentication: {
    type: "bearer",
    header: "Authorization: Bearer sk_live_...",
    signup: "https://strale.dev/signup",
    credit_card_required: false,
    description:
      "Register via POST /v1/auth/register with email. Returns API key and \u20ac2.00 trial credits instantly. No credit card required. No payment method needed to start.",
  },

  sandbox: {
    free_tier: true,
    trial_credits_eur: 2.0,
    credit_card_required: false,
    description:
      "New accounts receive \u20ac2.00 in trial credits automatically. No credit card required. No payment method needed. The free-tier iban-validate capability can be used to test the integration.",
    test_example: {
      endpoint: "POST /v1/do",
      body: {
        capability_slug: "iban-validate",
        inputs: { iban: "DE89370400440532013000" },
        max_price_cents: 10,
      },
    },
  },

  pricing: {
    model: "pay-per-use",
    currency: "EUR",
    wallet_based: true,
    credit_card_required: false,
    trial_credits_eur: 2.0,
    range: "\u20ac0.02 \u2013 \u20ac0.50 per capability execution",
    pricing_endpoint: "https://api.strale.io/v1/pricing",
    pricing_page: "https://strale.dev/pricing",
    capabilities_with_prices: "https://api.strale.io/v1/capabilities",
    description:
      "Pay only for what you use. New accounts receive \u20ac2.00 in trial credits instantly \u2014 no credit card required.",
  },

  sdks: {
    typescript: {
      package: "@petter_lindstrom/strale",
      install: "npm install @petter_lindstrom/strale",
      registry: "https://www.npmjs.com/package/@petter_lindstrom/strale",
    },
    python: {
      package: "straleio",
      install: "pip install straleio",
      registry: "https://pypi.org/project/straleio/",
    },
    mcp_server: {
      package: "strale-mcp",
      install: "npm install strale-mcp",
      registry: "https://www.npmjs.com/package/strale-mcp",
    },
    langchain: {
      package: "langchain-strale",
      install: "pip install langchain-strale",
      registry: "https://pypi.org/project/langchain-strale/",
    },
    crewai: {
      package: "crewai-strale",
      install: "pip install crewai-strale",
      registry: "https://pypi.org/project/crewai-strale/",
    },
  },

  rate_limits: {
    execute: { limit: 10, window: "1 second", scope: "per API key" },
    auth: { scope: "per IP" },
    other_authenticated: { scope: "per API key" },
    public_read: {
      rate_limited: false,
      note: "/v1/capabilities, /v1/solutions \u2014 no rate limit",
    },
    headers: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
    retry_header: "Retry-After (on 429 responses)",
  },

  legal: {
    terms_of_service: "https://api.strale.io/terms",
    privacy_policy: "https://api.strale.io/privacy",
    agent_usage:
      "API and automated agent access is explicitly permitted. No restrictions on bot or programmatic usage.",
  },

  support: {
    email: "hello@strale.io",
    security: "security@strale.io",
    status_endpoint: "https://api.strale.io/status",
  },

  structured_data: {
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name: "Strale API",
    description:
      "The trust layer for AI agents \u2014 250+ independently tested data capabilities across 27 countries",
    url: "https://api.strale.io",
    documentation: "https://strale.dev/docs",
    termsOfService: "https://strale.dev/terms",
    provider: {
      "@type": "Organization",
      name: "Strale",
      url: "https://strale.dev",
      email: "hello@strale.io",
    },
  },
};

function setWelcomeHeaders(c: { header: (name: string, value: string) => void }) {
  c.header("Cache-Control", "public, max-age=3600");
  c.header("Access-Control-Allow-Origin", "*");
  c.header("X-RateLimit-Limit", "60");
  c.header("X-RateLimit-Remaining", "59");
  c.header("X-RateLimit-Reset", String(Math.floor(Date.now() / 1000) + 60));
}

welcomeRoute.get("/", (c) => {
  setWelcomeHeaders(c);
  return c.json(WELCOME);
});

welcomeRoute.get("/api", (c) => {
  setWelcomeHeaders(c);
  return c.json(WELCOME);
});

// ─── Pricing endpoint ───────────────────────────────────────────────────────

const PRICING = {
  "@context": "https://schema.org",
  "@type": "WebAPI",
  name: "Strale API",
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "EUR",
    lowPrice: "0.02",
    highPrice: "0.50",
    offerCount: 250,
    description:
      "Pay-per-use. \u20ac0.02\u2013\u20ac0.50 per capability execution. \u20ac2.00 trial credits free, no credit card required.",
  },
  model: "pay-per-use",
  currency: "EUR",
  wallet_based: true,
  trial_credits_eur: 2.0,
  credit_card_required: false,
  description:
    "Pay only for what you use. New accounts receive \u20ac2.00 in trial credits instantly \u2014 no credit card required. No payment method needed to start.",
  price_range: {
    min_cents: 2,
    max_cents: 50,
    description: "\u20ac0.02 \u2013 \u20ac0.50 per capability execution",
  },
  top_up: {
    minimum_eur: 10,
    suggested_amounts_eur: [10, 25, 50, 100],
    method: "Stripe Checkout",
    endpoint: "POST /v1/wallet/topup",
  },
  free_capabilities: [
    {
      slug: "iban-validate",
      price_cents: 3,
      description: "Validate IBAN structure and extract bank details",
    },
    {
      slug: "email-validate",
      price_cents: 2,
      description: "Validate email address format and deliverability",
    },
    {
      slug: "dns-lookup",
      price_cents: 2,
      description: "DNS record lookup for any domain",
    },
    {
      slug: "json-repair",
      price_cents: 2,
      description: "Repair malformed JSON strings",
    },
    {
      slug: "url-to-markdown",
      price_cents: 5,
      description: "Convert any URL to clean markdown",
    },
  ],
  full_catalog: "https://api.strale.io/v1/capabilities",
  pricing_page: "https://strale.dev/pricing",
};

welcomeRoute.get("/v1/pricing", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  c.header("Access-Control-Allow-Origin", "*");
  return c.json(PRICING);
});

welcomeRoute.get("/pricing", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  c.header("Access-Control-Allow-Origin", "*");
  return c.json(PRICING);
});

// ─── Status endpoint ────────────────────────────────────────────────────────

welcomeRoute.get("/status", (c) => {
  c.header("Cache-Control", "public, max-age=60");
  c.header("Access-Control-Allow-Origin", "*");
  return c.json({
    status: "operational",
    health_endpoint: "https://api.strale.io/health",
    uptime_check: "https://api.strale.io/health",
    changelog: "https://strale.dev/changelog",
    incidents: [],
  });
});

// ─── Redirect routes ────────────────────────────────────────────────────────

const REDIRECTS: Array<[string, string]> = [
  ["/changelog", "https://strale.dev/changelog"],
  ["/terms", "https://strale.dev/terms"],
  ["/terms-of-service", "https://strale.dev/terms"],
  ["/privacy", "https://strale.dev/privacy"],
  ["/docs", "https://strale.dev/docs"],
  ["/developers", "https://strale.dev/docs"],
  ["/api-reference", "https://strale.dev/api-reference"],
  ["/signup", "https://strale.dev/signup"],
];

for (const [path, target] of REDIRECTS) {
  welcomeRoute.get(path, (c) => {
    c.header("Location", target);
    c.header("Access-Control-Allow-Origin", "*");
    return c.json(
      { redirect: target, message: `This resource is available at ${target}` },
      301,
    );
  });
}

// ─── robots.txt ─────────────────────────────────────────────────────────────

const ROBOTS_TXT = `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: FacebookBot
Allow: /

User-agent: Applebot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Bytespider
Allow: /

User-agent: CCBot
Allow: /

Sitemap: https://api.strale.io/sitemap.xml
`;

welcomeRoute.get("/robots.txt", (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(ROBOTS_TXT);
});

// ─── sitemap.xml ────────────────────────────────────────────────────────────

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://api.strale.io/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://api.strale.io/openapi.json</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>https://api.strale.io/.well-known/agent-card.json</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://api.strale.io/.well-known/mcp.json</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>https://api.strale.io/.well-known/ai-catalog.json</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://api.strale.io/v1/capabilities</loc><changefreq>daily</changefreq><priority>0.8</priority></url>
  <url><loc>https://api.strale.io/v1/solutions</loc><changefreq>daily</changefreq><priority>0.7</priority></url>
  <url><loc>https://api.strale.io/v1/pricing</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>https://api.strale.io/status</loc><changefreq>always</changefreq><priority>0.5</priority></url>
  <url><loc>https://api.strale.io/health</loc><changefreq>always</changefreq><priority>0.3</priority></url>
  <url><loc>https://api.strale.io/llms.txt</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>https://api.strale.io/llms-full.txt</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>
  <url><loc>https://strale.dev/docs</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://strale.dev/pricing</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://strale.dev/changelog</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>https://strale.dev/signup</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>https://strale.dev/terms</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>
  <url><loc>https://strale.dev/privacy</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>
</urlset>
`;

welcomeRoute.get("/sitemap.xml", (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(SITEMAP_XML);
});
