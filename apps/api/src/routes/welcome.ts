/**
 * Agent Welcome Mat — GET / and GET /api
 *
 * The single highest-impact Beacon fix: a rich JSON self-description
 * that lets any agent fully understand and navigate the API on first contact.
 *
 * Also serves robots.txt and sitemap.xml for AI crawler discovery.
 */

import { Hono } from "hono";

export const welcomeRoute = new Hono();

// ─── Welcome JSON ───────────────────────────────────────────────────────────

const WELCOME = {
  name: "Strale API",
  tagline: "The trust layer for AI agents",
  description:
    "250+ independently tested and scored data capabilities across 27 countries. Business data, compliance checks, web scraping, and more — accessible via REST API, MCP, and A2A protocols.",
  version: "1.0.0",

  endpoints: {
    execute: "POST /v1/do",
    capabilities: "GET /v1/capabilities",
    solutions: "GET /v1/solutions",
    suggest: "POST /v1/suggest",
    register: "POST /v1/auth/register",
    wallet_balance: "GET /v1/wallet/balance",
    wallet_topup: "POST /v1/wallet/topup",
    transactions: "GET /v1/transactions",
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
    changelog: "https://strale.dev/changelog",
    status: "https://api.strale.io/health",
  },

  authentication: {
    type: "bearer",
    header: "Authorization: Bearer sk_live_...",
    signup: "https://strale.dev/signup",
    description:
      "Register via POST /v1/auth/register with email. Returns API key and \u20ac2.00 trial credits instantly. No credit card required.",
  },

  sandbox: {
    free_tier: true,
    trial_credits_eur: 2.0,
    description:
      "New accounts receive \u20ac2.00 in trial credits. No credit card required. The free-tier iban-validate capability can be used to test the integration.",
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
    range: "\u20ac0.02 \u2013 \u20ac0.50 per capability execution",
    pricing_page: "https://strale.dev/pricing",
    capabilities_with_prices: "https://api.strale.io/v1/capabilities",
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
    terms_of_service: "https://strale.dev/terms",
    privacy_policy: "https://strale.dev/privacy",
    agent_usage:
      "API and automated agent access is explicitly permitted. No restrictions on bot or programmatic usage.",
  },

  support: {
    email: "hello@strale.io",
    security: "security@strale.io",
    status_endpoint: "https://api.strale.io/health",
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

welcomeRoute.get("/", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  c.header("Access-Control-Allow-Origin", "*");
  return c.json(WELCOME);
});

welcomeRoute.get("/api", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  c.header("Access-Control-Allow-Origin", "*");
  return c.json(WELCOME);
});

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
  <url><loc>https://api.strale.io/health</loc><changefreq>always</changefreq><priority>0.3</priority></url>
  <url><loc>https://api.strale.io/llms.txt</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>https://api.strale.io/llms-full.txt</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>
</urlset>
`;

welcomeRoute.get("/sitemap.xml", (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(SITEMAP_XML);
});
