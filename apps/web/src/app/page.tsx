import Link from "next/link";
import { ArrowRight, Globe, Cpu, Zap, Shield } from "lucide-react";
import { getCapabilities, getHomepageCategories } from "@/lib/api";
import { CodeBlock } from "@/components/code-block";

const HERO_CODE = `const result = await strale.do("swedish-company-data", {
  org_number: "5560125790"  // Ericsson
});

// → Returns in 1.2s, costs €0.80
{
  "name": "Telefonaktiebolaget LM Ericsson",
  "status": "Active",
  "registration_date": "1918-10-18",
  "address": "Torshamnsgatan 21, Stockholm",
  "industry": "Manufacture of communication equipment",
  "employees": "100,000+",
  "revenue_sek": 263_400_000_000
}`;

const STEPS = [
  {
    num: "01",
    title: "Discover",
    desc: "Your agent discovers Strale via MCP, A2A, or SDK.",
  },
  {
    num: "02",
    title: "Call",
    desc: 'Agent calls strale.do("vat-validate", { ... }) with your API key.',
  },
  {
    num: "03",
    title: "Get results",
    desc: "Structured JSON returned in milliseconds. \u20AC0.02\u2013\u20AC1.00 per call.",
  },
];

const INTEGRATIONS = [
  {
    name: "MCP",
    desc: "Works with Claude, Cursor, Windsurf, and 300+ MCP clients",
    code: `// claude_desktop_config.json
{
  "mcpServers": {
    "strale": {
      "url": "https://strale-production.up.railway.app/mcp"
    }
  }
}`,
  },
  {
    name: "A2A",
    desc: "Discoverable by Google A2A protocol agents",
    code: `// Agent Card at /.well-known/agent-card.json
GET https://strale-production.up.railway.app/.well-known/agent-card.json
// → 233 capabilities as A2A skills`,
  },
  {
    name: "LangChain / CrewAI",
    desc: "pip install langchain-strale",
    code: `from langchain_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_...")
tools = toolkit.get_tools()  # 233 tools`,
  },
  {
    name: "Direct API",
    desc: "POST /v1/do",
    code: `curl -X POST https://strale-production.up.railway.app/v1/do \\
  -H "Authorization: Bearer sk_live_..." \\
  -d '{"task":"validate IBAN","inputs":{"iban":"SE..."}}'`,
  },
];

const TRUST_SIGNALS = [
  { icon: Globe, text: "EU-hosted (Germany)" },
  { icon: Shield, text: "GDPR compliant" },
  { icon: Zap, text: "\u20AC2.00 free trial \u2014 no card required" },
  { icon: Cpu, text: "Transparent per-call pricing" },
];

const CATEGORY_ICONS: Record<string, string> = {
  "data-extraction": "\uD83C\uDFE2",
  "financial": "\uD83C\uDFE6",
  "compliance": "\u2696\uFE0F",
  "trade": "\uD83D\uDEA2",
  "competitive-intelligence": "\uD83D\uDCC8",
  "developer-tools": "\uD83D\uDEE0\uFE0F",
  "document-extraction": "\uD83D\uDCC4",
  "validation": "\u2713",
};

export const revalidate = 3600;

export default async function HomePage() {
  const capabilities = await getCapabilities();
  const categories = getHomepageCategories(capabilities);

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col justify-center">
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-[56px] lg:leading-[1.1]">
              Hundreds of capabilities your AI agent can buy at runtime
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted">
              Company data, compliance, finance, logistics, recruiting &mdash; one
              API, transparent pricing, structured JSON.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/signup"
                className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-accent-hover"
              >
                Get API Key (free)
              </Link>
              <Link
                href="/capabilities"
                className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-border-bright hover:bg-surface"
              >
                Browse Capabilities
              </Link>
            </div>
          </div>
          <div className="flex items-center">
            <CodeBlock code={HERO_CODE} filename="agent.ts" language="typescript" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.num}>
                <span className="font-mono text-sm text-accent">{step.num}</span>
                <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capability categories */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {capabilities.length} capabilities across {categories.length}+ categories
            </h2>
            <p className="mt-3 text-muted">
              Every capability returns structured JSON with transparent, per-call pricing.
            </p>
          </div>
          <Link
            href="/capabilities"
            className="hidden items-center gap-1 text-sm text-accent transition-colors hover:text-accent-hover sm:flex"
          >
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/capabilities?category=${cat.slug}`}
              className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-bright hover:bg-surface-bright"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{CATEGORY_ICONS[cat.slug] ?? "\uD83D\uDCE6"}</span>
                <span className="rounded-full bg-background px-2.5 py-0.5 font-mono text-xs text-accent">
                  {cat.count}
                </span>
              </div>
              <h3 className="mt-3 font-semibold">{cat.label}</h3>
              <p className="mt-1 text-sm text-muted">{cat.description}</p>
            </Link>
          ))}
        </div>
        <Link
          href="/capabilities"
          className="mt-6 flex items-center gap-1 text-sm text-accent transition-colors hover:text-accent-hover sm:hidden"
        >
          View all capabilities <ArrowRight size={14} />
        </Link>
      </section>

      {/* Integrations */}
      <section className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Works with every agent framework
          </h2>
          <p className="mt-3 text-muted">
            Connect via MCP, A2A, LangChain, CrewAI, Semantic Kernel, or plain HTTP.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {INTEGRATIONS.map((int) => (
              <div
                key={int.name}
                className="rounded-xl border border-border bg-surface p-6"
              >
                <h3 className="font-semibold">{int.name}</h3>
                <p className="mt-1 text-sm text-muted">{int.desc}</p>
                <div className="mt-4">
                  <CodeBlock code={int.code} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {TRUST_SIGNALS.map((signal) => (
            <div key={signal.text} className="flex items-center gap-3">
              <signal.icon size={18} className="shrink-0 text-accent" />
              <span className="text-sm text-muted">{signal.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Start building in minutes
          </h2>
          <p className="mx-auto mt-4 max-w-md text-muted">
            Get &euro;2.00 in free credits. No credit card required. Your agent can
            start calling capabilities immediately.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-accent-hover"
            >
              Get API Key (free)
            </Link>
            <Link
              href="/docs"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-border-bright hover:bg-surface"
            >
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
