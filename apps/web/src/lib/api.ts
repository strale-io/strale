const API_BASE = "https://api.strale.io";

export interface Capability {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  avg_latency_ms?: number;
  success_rate?: number;
}

export interface CategoryInfo {
  slug: string;
  label: string;
  description: string;
  count: number;
}

const CATEGORY_META: Record<string, { label: string; description: string }> = {
  "data-extraction": { label: "Company Data", description: "Business registries across 27 countries" },
  "developer-tools": { label: "Developer Tools", description: "SQL generation, OpenAPI, regex, code conversion" },
  "validation": { label: "Validation", description: "IBAN, SWIFT, VAT, EORI, and format checks" },
  "data-processing": { label: "Data Processing", description: "Cleanup, normalization, deduplication" },
  "web-scraping": { label: "Web Scraping", description: "Screenshots, markdown conversion, structured scraping" },
  "monitoring": { label: "Monitoring", description: "Uptime checks, log parsing, error analysis" },
  "competitive-intelligence": { label: "Marketing & SEO", description: "Keywords, email deliverability, audits" },
  "file-conversion": { label: "File Conversion", description: "HTML to PDF, image resize, base64 encoding" },
  "utility": { label: "Utilities", description: "Timezone meetings, domain checks, YouTube summaries" },
  "financial": { label: "Finance & Banking", description: "IBAN, SWIFT, ECB rates, SEPA validation" },
  "web-intelligence": { label: "Web Intelligence", description: "DNS, WHOIS, SSL checks, tech stack detection" },
  "compliance": { label: "Legal & Compliance", description: "EU AI Act, GDPR, cookie scanning" },
  "text-processing": { label: "Text & Language", description: "Translation, summarization, sentiment analysis" },
  "document-extraction": { label: "Document Extraction", description: "Invoices, contracts, receipts, meeting notes" },
  "security": { label: "Security", description: "Secret scanning, header checks, CVE lookup" },
  "content-writing": { label: "Content & Writing", description: "Blog outlines, email drafts, social posts" },
  "agent-tooling": { label: "Agent Tooling", description: "LLM output validation, prompt optimization" },
  "trade": { label: "Logistics & Trade", description: "Customs duties, Incoterms, container tracking" },
};

// Homepage categories — curated order and selection
const HOMEPAGE_CATEGORIES = [
  "data-extraction",
  "financial",
  "compliance",
  "trade",
  "competitive-intelligence",
  "developer-tools",
  "document-extraction",
  "validation",
];

export async function getCapabilities(): Promise<Capability[]> {
  const res = await fetch(`${API_BASE}/v1/capabilities`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.capabilities ?? data.data ?? [];
}

export function getCategories(capabilities: Capability[]): CategoryInfo[] {
  const counts: Record<string, number> = {};
  for (const cap of capabilities) {
    counts[cap.category] = (counts[cap.category] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([slug, count]) => ({
      slug,
      label: CATEGORY_META[slug]?.label ?? slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      description: CATEGORY_META[slug]?.description ?? "",
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export function getHomepageCategories(capabilities: Capability[]): CategoryInfo[] {
  const all = getCategories(capabilities);
  const map = new Map(all.map(c => [c.slug, c]));
  return HOMEPAGE_CATEGORIES
    .map(slug => map.get(slug))
    .filter((c): c is CategoryInfo => c !== undefined);
}

export function formatPrice(priceCents: number): string {
  return `€${(priceCents / 100).toFixed(2)}`;
}
