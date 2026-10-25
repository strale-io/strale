// Use cases (SITE-STRUCTURE.md pages 7 and 8): the jobs agents are built to do,
// each with the tools an agent calls for it, in call order. Editorial copy lives
// here; everything else is read from the catalogue at build time:
//
//   - every tool slug must be a visible tool, and every bundled-check slug a live
//     bundled check, or resolveUseCases() throws naming the slug (test/editorial.test.ts
//     checks the tool slugs against manifests/ too, so a rename fails in CI first);
//   - prices, names, free status and x402 eligibility come from the catalogue;
//   - a worked-example step without its own `output` shows the tool's published
//     example (`output_schema.example`), field by field, and a field it does not
//     publish is an error. Illustrative inputs and outputs may only use field
//     names the tool's own schema has, so the example cannot drift from the tool;
//   - a use case that calls a tool classified as a screening signal or a risk
//     synthesis (manifest `gdpr_art_22_classification`) must say where the person
//     stays in the loop, or resolveUseCases() throws.
//
// Bundled checks are read from the live API only. A preview build (repository
// manifests) has none, so a bundle step there is marked unavailable and the page
// says so; it is never dropped.
//
// Adding a use case is a content change: add an entry below. Never rank or pick
// tools by popularity (claims.yaml `most-popular-tools` is forbidden).
import type { Capability, SiteData, Solution, X402Item } from "../lib/types.ts";

/** Spot illustrations in src/assets/illustrations, by file name. */
export type Illustration = "search-web" | "read-documents" | "check-details" | "company-records" | "screening" | "pay-balance" | "developer-jobs";

type Values = Record<string, unknown>;

export interface UseCaseStep {
  /** A tool slug (/tools/:slug), or a bundled-check slug (/solutions/:slug) with `bundle: true`. */
  slug: string;
  bundle?: boolean;
  /** What the agent does at this step, in the reader's terms. */
  does: string;
  /** Inputs for the worked example. Omit to use the tool's published example input. */
  input?: Values;
  /** Illustrative output for the worked example. Omit to show `fields` of the tool's published example. */
  output?: Values;
  /** Fields of the published example output to show, in order. */
  fields?: string[];
}

export interface UseCase {
  slug: string;
  /** The job, as a short name: card titles, labels, breadcrumbs. */
  title: string;
  /** The L1-style headline on the use-case page. */
  headline: string;
  /** One line for the card and the page description. */
  line: string;
  /** The benefit lead under the headline. */
  lead: string;
  /** One sentence that sets the scene for the worked example. */
  scenario: string;
  /** What the agent ends up with, said after the steps. */
  outcome: string;
  steps: UseCaseStep[];
  /** The same job as one bundled check, offered beside the tool-by-tool route. */
  oneCall?: { slug: string; pitch: string };
  /** Where a person stays in the loop. Only for checks that feed a decision about a person or company. */
  human?: { title: string; body: string };
  art: Illustration;
}

export const USE_CASES: UseCase[] = [
  {
    slug: "research-agents",
    title: "Research the web",
    headline: "Ask a question. Your agent comes back with the answer, the source and the papers behind it.",
    line: "Search the web, turn the best page into clean text, and pull the scholarly papers behind it.",
    lead: "A research agent needs three things: a search engine, a way to read what it finds, and the literature. Strale gives it all three through the connection it already has, paid per call.",
    scenario: "Someone asks the agent what the research says about large language models in education.",
    outcome: "The agent answers from a page it actually read, and cites a paper it can link to.",
    steps: [
      {
        slug: "google-search",
        does: "Searches Google and gets ranked results, each with its title, link and snippet.",
        input: { query: "large language models in education research" },
        output: { query: "large language models in education research", results: [{ position: 1, title: "Large language models in the classroom: a review", url: "https://example.org/llm-education-review", snippet: "A review of how schools and universities use large language models, and what the studies found." }] },
      },
      {
        slug: "url-to-markdown",
        does: "Opens the best result and turns the page into clean text the model can read.",
        input: { url: "https://example.org/llm-education-review" },
        output: { title: "Large language models in the classroom: a review", markdown: "# Large language models in the classroom\n\nStudies since 2023 point to three uses that hold up…", word_count: 2140 },
      },
      {
        slug: "academic-paper-search",
        does: "Finds the papers behind the claims, with authors, citations and an open-access link.",
        input: { query: "large language models", limit: 1 },
        fields: ["papers", "returned"],
      },
    ],
    art: "search-web",
  },
  {
    slug: "reading-documents",
    title: "Read documents",
    headline: "Hand your agent the receipt, the invoice and the contract. It hands back the fields.",
    line: "Text from photos, and the fields from receipts, invoices and PDFs, ready for the next step.",
    lead: "Documents arrive as photos, scans and PDFs. Your agent turns each one into structured fields it can file, total or act on, with one reader for every kind of document.",
    scenario: "An agent works the finance inbox: a photo of a coffee receipt, a supplier invoice and a supply contract arrive in the same hour.",
    outcome: "Every document becomes fields the agent can file: the receipt as an expense, the invoice ready to check, the contract terms on record.",
    steps: [
      {
        slug: "image-to-text",
        does: "Reads the text off the photographed receipt.",
        input: { image_url: "https://example.com/receipts/2024-01-15.jpg" },
        output: { text: "Example Coffee\nDate: 2024-01-15\nCaffe Latte x1 $5.50\nTotal: $5.50\nVisa ending 4242", confidence: "high" },
      },
      {
        slug: "receipt-categorize",
        does: "Turns the receipt text into an expense: vendor, date, amount and category.",
        input: { text: "Example Coffee\nDate: 2024-01-15\nCaffe Latte x1 $5.50\nTotal: $5.50\nVisa ending 4242" },
        output: { vendor_name: "Example Coffee", date: "2024-01-15", total_amount: 5.5, currency: "USD", category: "meals" },
      },
      {
        slug: "invoice-extract",
        does: "Pulls the supplier, totals, VAT and bank details out of the invoice PDF.",
        input: { url: "https://example-supplies.example/invoices/INV-1042.pdf" },
        output: { vendor_name: "Example Supplies Ltd", invoice_number: "INV-1042", invoice_date: "2026-10-01", total_amount: 1440, currency: "GBP", vendor_vat: "GB000000000", iban: "GB33BUKB20201555555555" },
      },
      {
        slug: "pdf-extract",
        does: "Reads the contract and answers what it was asked: the payment terms and the notice period.",
        input: { url: "https://example-supplies.example/contracts/supply-agreement.pdf", extract: "payment terms and notice period" },
        output: { data: { extracted_data: { payment_terms: "30 days from invoice date", notice_period: "90 days" } } },
      },
    ],
    art: "read-documents",
  },
  {
    slug: "checking-data",
    title: "Check details before acting",
    headline: "Your agent checks the details before it sends, saves or pays.",
    line: "Email address, phone number, IBAN format and EU VAT number, checked before the agent acts on them.",
    lead: "One bad detail turns into a bounced welcome email, a wrong record or a failed payment. Your agent checks each one first and asks again only when something is off.",
    scenario: "A new business customer fills in a sign-up form, and the agent creates their account.",
    outcome: "The agent saves the details that check out and asks the customer again for the one that does not: an email address whose domain has no mail server, most likely a typo.",
    steps: [
      {
        slug: "email-validate",
        does: "Checks the address can receive mail: syntax, mail server, disposable and role addresses.",
        input: { email: "maria.santos@gmail.con" },
        output: { email: "maria.santos@gmail.con", valid: false, domain: "gmail.con", has_mx_records: false, is_disposable: false },
      },
      {
        slug: "phone-validate",
        does: "Checks the phone number and returns it in international format, with its country and type.",
        input: { phone_number: "+46701740605" },
        output: { valid: true, e164: "+46701740605", country_code: "SE", phone_type: "mobile" },
      },
      {
        slug: "iban-validate",
        does: "Checks the IBAN format and checksum, and reads the country and bank code from it.",
        input: { iban: "SE4550000000058398257466" },
        output: { valid: true, country_code: "SE", bank_code: "500" },
      },
      {
        slug: "vat-validate",
        does: "Checks the EU VAT number against the EU’s VIES service and returns the registered name.",
        input: { vat_number: "SE556703748501" },
        output: { valid: true, vat_number: "SE556703748501", company_name: "Spotify AB", country_code: "SE" },
      },
    ],
    art: "check-details",
  },
  {
    slug: "onboarding",
    title: "Onboard a supplier or customer",
    headline: "Your agent looks up the company and screens it before you sign.",
    line: "Find the company in official records, screen it against sanctions lists and adverse media, or run the full check in one call.",
    lead: "Onboarding a business means the same checks every time: is the company real, is it active, is it on a sanctions list, is it in the news for the wrong reasons. Your agent runs them and hands your team the evidence.",
    scenario: "A buyer adds a new UK supplier, Example Supplies Ltd, and the agent prepares the onboarding file.",
    outcome: "The onboarding file holds the register record and both screening results, ready for the person who approves the supplier.",
    steps: [
      {
        slug: "uk-company-data",
        does: "Looks the company up in Companies House: name, status, incorporation date and registered address.",
        input: { company_number: "00000000" },
        output: { company_name: "EXAMPLE SUPPLIES LTD", company_number: "00000000", status: "active", incorporation_date: "2016-03-14", address: "1 Example Street, London, EC1A 1AA, England" },
      },
      {
        slug: "sanctions-check",
        does: "Screens the company against consolidated sanctions lists, including the EU, US, UN and UK lists.",
        input: { name: "Example Supplies Ltd", country: "GB" },
        output: { query: "Example Supplies Ltd", is_sanctioned: false, match_count: 0, matches: [] },
      },
      {
        slug: "adverse-media-check",
        does: "Searches news coverage for financial crime, regulatory action and other adverse stories.",
        input: { name: "Example Supplies Ltd", entity_type: "company" },
        output: { query: "Example Supplies Ltd", risk_level: "none", total_hits: 0, categories_found: [] },
      },
    ],
    oneCall: { slug: "kyb-complete-uk", pitch: "Or run the full check in one call: the register, VAT, legal entity and ownership links, sanctions, politically exposed persons, adverse media, the company’s web domain and an insolvency check, with an AI-written summary for your reviewer." },
    human: {
      title: "Your agent gathers the evidence. Your team signs off.",
      body: "Screening returns matches for a person to review, and the full check adds an AI-written summary of every step. The agent does the legwork on every new supplier or customer; the person who approves them sees exactly what was checked and what came back.",
    },
    art: "company-records",
  },
  {
    slug: "invoice-issuer",
    title: "Check who issued an invoice",
    headline: "Before your agent pays an invoice, it checks who is asking to be paid.",
    line: "Read the invoice, then check the issuer in one call: register, VAT, bank details, sanctions and the sender’s domain.",
    lead: "Fake and altered invoices look exactly like real ones. Your agent reads every invoice and checks the company behind it, the bank details and the domain it came from, at one price per invoice.",
    scenario: "An invoice from Example Supplies Ltd lands in the accounts inbox, and the agent prepares it for payment.",
    outcome: "The invoice reaches the approver with every check’s result and a summary that points at the one thing worth a second look.",
    steps: [
      {
        slug: "invoice-extract",
        does: "Reads the invoice: the supplier, the amount, the VAT number and the bank details to pay.",
        input: { url: "https://example-supplies.example/invoices/INV-1042.pdf" },
        output: { vendor_name: "Example Supplies Ltd", invoice_number: "INV-1042", total_amount: 1440, currency: "GBP", vendor_vat: "GB000000000", iban: "GB33BUKB20201555555555" },
      },
      {
        slug: "invoice-verify-uk",
        bundle: true,
        does: "Runs the invoice-issuer check with the company number, bank details and sender domain from the invoice.",
        input: { company_number: "00000000", vat_number: "GB000000000", iban: "GB33BUKB20201555555555", sender_domain: "example-supplies.example", sender_email: "accounts@example-supplies.example" },
        output: {
          checks: { company_exists: true, iban_valid: true, sanctions_clear: true },
          narrative: { risk_level: "medium", summary: "The issuer is an active UK company, the IBAN is well formed and no sanctions matches were found. The sender’s domain was registered three weeks ago, so confirm the bank details with a known contact before paying." },
        },
      },
    ],
    human: {
      title: "Your agent does the checking. A person approves the payment.",
      body: "The issuer check returns every step’s result and an AI-written summary for the approver. Routine invoices arrive ready to approve; the odd one arrives with the reason it needs a closer look.",
    },
    art: "screening",
  },
  {
    slug: "seo-and-web",
    title: "Audit a website",
    headline: "Your agent audits the site, sees where it ranks and checks what runs it.",
    line: "SEO audit, search rankings, tech stack, DNS and certificate checks for any domain.",
    lead: "SEO and web agents need a toolbox: an auditor, a view of the search results, and the checks that tell them how a site is built and kept. Your agent gets every one of them through the same key.",
    scenario: "A marketing agent prepares its weekly report on a client’s website, example.com.",
    outcome: "The report lists the fixes that matter, where the site ranks, what it runs on, and that its DNS and certificate are in order.",
    steps: [
      {
        slug: "seo-audit",
        does: "Audits the page: title, description, headings, structured data, sitemap and the fixes in priority order.",
        input: { url: "https://example.com" },
        output: { overall_score: 62, issues: ["Meta description missing", "No Open Graph tags"], prioritized_fixes: [{ priority: "high", issue: "Meta description missing", fix: "Add a description of 120 to 160 characters" }] },
      },
      {
        slug: "serp-analyze",
        does: "Reads the Google results for the client’s keyword: who ranks, and which result features appear.",
        input: { keyword: "example domain", country: "US", language: "en" },
        output: { organic_results: [{ position: 1, domain: "example.com", title: "Example Domain", url: "https://example.com/" }], serp_features: ["people_also_ask", "related_searches"] },
      },
      {
        slug: "company-tech-stack",
        does: "Detects what the site runs on: hosting, CDN, analytics and frameworks.",
        input: { domain: "example.com" },
        output: { cdn: "Cloudflare", hosting_provider: "Cloudflare", analytics: [] },
      },
      {
        slug: "dns-lookup",
        does: "Reads the DNS records, including whether SPF and DMARC protect the domain’s email.",
        input: { domain: "example.com" },
        output: { domain: "example.com", has_spf: true, has_dmarc: true, ns_records: ["elliott.ns.cloudflare.com", "hera.ns.cloudflare.com"] },
      },
      {
        slug: "ssl-check",
        does: "Checks the certificate is valid and how many days are left before it expires.",
        input: { domain: "example.com" },
        output: { domain: "example.com", valid: true, is_expired: false, days_until_expiry: 74 },
      },
    ],
    art: "developer-jobs",
  },
];

// ---------- build-time resolution ----------

export type ExampleSource = "published" | "illustrative";

export interface ResolvedStep {
  slug: string;
  bundle: boolean;
  /** Link target: /tools/:slug or /solutions/:slug. */
  href: string;
  name: string;
  does: string;
  /** Null for a bundled check missing from a preview build. */
  priceCents: number | null;
  /** The catalogue price, also for a free tool (what a call's price cap is set against). */
  listPriceCents: number | null;
  free: boolean;
  x402: X402Item | null;
  /** For a bundled check: the tools it runs, in order (empty in a preview build). */
  bundleSteps: { slug: string; name: string }[];
  /** False only for a bundled check in a preview build, which has none. */
  available: boolean;
  input: Values;
  output: Values | null;
  inputSource: ExampleSource;
  outputSource: ExampleSource;
}

export interface ResolvedUseCase extends Omit<UseCase, "steps" | "oneCall"> {
  steps: ResolvedStep[];
  oneCall: (ResolvedStep & { pitch: string }) | null;
  /** Cost of one run with an API key, in cents; null when a price is missing from this build. */
  totalCents: number | null;
}

const fail = (useCase: string, msg: string): never => {
  throw new Error(`apps/web/src/content/use-cases.ts, use case "${useCase}": ${msg}`);
};

function fieldsOf(schema: Capability["output_schema"] | Capability["input_schema"]): Set<string> {
  return new Set([...Object.keys(schema?.properties ?? {}), ...Object.keys(schema?.example ?? {})]);
}

function resolveTool(d: SiteData, uc: string, step: UseCaseStep, caps: Map<string, Capability>, free: Set<string>, x402: Map<string, X402Item>): ResolvedStep {
  const c = caps.get(step.slug) ?? fail(uc, `tool "${step.slug}" is not a visible tool in the ${d.mode} catalogue (${d.source}). Fix the slug or remove the step.`);
  const published = c.output_schema?.example ?? null;
  let output: Values | null;
  if (step.output) {
    const known = fieldsOf(c.output_schema);
    const unknown = Object.keys(step.output).filter((k) => !known.has(k));
    if (known.size && unknown.length) fail(uc, `illustrative output for "${c.slug}" uses ${unknown.join(", ")}, which the tool's output schema does not have.`);
    output = step.output;
  } else {
    if (!published) fail(uc, `"${c.slug}" publishes no example output; give the step an illustrative output.`);
    const fields = step.fields ?? Object.keys(published!);
    const missing = fields.filter((f) => !(f in published!));
    if (missing.length) fail(uc, `"${c.slug}"'s published example has no ${missing.join(", ")}.`);
    output = Object.fromEntries(fields.map((f) => [f, published![f]]));
  }
  let input: Values;
  if (step.input) {
    const known = fieldsOf(c.input_schema);
    const unknown = Object.keys(step.input).filter((k) => !known.has(k));
    if (known.size && unknown.length) fail(uc, `example input for "${c.slug}" uses ${unknown.join(", ")}, which the tool does not accept.`);
    input = step.input;
  } else {
    input = d.manifests.get(c.slug)?.example_input ?? fail(uc, `"${c.slug}" publishes no example input; give the step one.`);
  }
  const isFree = free.has(c.slug);
  return {
    slug: c.slug, bundle: false, href: `/tools/${c.slug}`, name: c.name, does: step.does,
    priceCents: isFree ? 0 : c.price_cents, listPriceCents: c.price_cents, free: isFree, x402: x402.get(c.slug) ?? null, bundleSteps: [], available: true,
    input, output, inputSource: step.input ? "illustrative" : "published", outputSource: step.output ? "illustrative" : "published",
  };
}

function resolveBundle(d: SiteData, uc: string, step: Pick<UseCaseStep, "slug" | "does" | "input" | "output">, caps: Map<string, Capability>, x402: Map<string, X402Item>): ResolvedStep {
  const s: Solution | undefined = d.solutions.find((x) => x.slug === step.slug);
  // Preview builds read no bundled checks at all (lib/load-preview.ts); anywhere else a missing bundle is an error.
  const preview = d.mode !== "live" && d.solutions.length === 0;
  if (!s && !preview) fail(uc, `bundled check "${step.slug}" is not in the ${d.mode} catalogue (${d.source}). Fix the slug or remove the step.`);
  const order = s?.detail?.steps.length ? [...s.detail.steps].sort((a, b) => a.step_order - b.step_order).map((x) => x.capability_slug) : s?.capabilities ?? [];
  const known = s?.detail?.input_schema ? fieldsOf(s.detail.input_schema) : new Set<string>();
  const unknown = Object.keys(step.input ?? {}).filter((k) => !known.has(k));
  if (known.size && unknown.length) fail(uc, `example input for "${step.slug}" uses ${unknown.join(", ")}, which the bundled check does not accept.`);
  return {
    slug: step.slug, bundle: true, href: `/solutions/${step.slug}`, name: s?.name ?? step.slug, does: step.does,
    priceCents: s ? s.price_cents : null, listPriceCents: s ? s.price_cents : null, free: false, x402: x402.get(step.slug) ?? null,
    bundleSteps: order.map((slug) => ({ slug, name: caps.get(slug)?.name ?? s?.detail?.steps.find((x) => x.capability_slug === slug)?.capability_name ?? slug })),
    available: !!s,
    input: step.input ?? s?.detail?.example_input ?? {}, output: step.output ?? null,
    inputSource: step.input ? "illustrative" : "published", outputSource: "illustrative",
  };
}

/** Screening and synthesis tools feed a decision about a person or company (manifest gdpr_art_22_classification). */
const DECISION_FEEDING = new Set(["screening_signal", "risk_synthesis"]);

/** Every use case, checked against and priced from the catalogue. Throws on a slug or field the catalogue does not have. */
export function resolveUseCases(d: SiteData): ResolvedUseCase[] {
  const caps = new Map(d.capabilities.map((c) => [c.slug, c]));
  const free = new Set(d.facts.capability_counts.free_tier_slugs);
  const x402Tools = new Map(d.x402.capabilities.map((x) => [x.slug, x]));
  const x402Bundles = new Map(d.x402.solutions.map((x) => [x.slug, x]));
  const seen = new Set<string>();
  return USE_CASES.map((u) => {
    if (seen.has(u.slug)) fail(u.slug, "slug is used twice.");
    seen.add(u.slug);
    if (u.steps.length < 1 || u.steps.length > 5) fail(u.slug, `has ${u.steps.length} steps; a use case names one to five tools or bundled checks.`);
    const steps = u.steps.map((s) => (s.bundle ? resolveBundle(d, u.slug, s, caps, x402Bundles) : resolveTool(d, u.slug, s, caps, free, x402Tools)));
    const oneCall = u.oneCall ? { ...resolveBundle(d, u.slug, { slug: u.oneCall.slug, does: u.oneCall.pitch }, caps, x402Bundles), pitch: u.oneCall.pitch } : null;
    const reached = [...steps.flatMap((s) => (s.bundle ? s.bundleSteps.map((b) => b.slug) : [s.slug])), ...(oneCall?.bundleSteps.map((b) => b.slug) ?? [])];
    const feeding = reached.filter((slug) => DECISION_FEEDING.has(d.manifests.get(slug)?.gdpr_art_22_classification ?? ""));
    if (feeding.length && !u.human) fail(u.slug, `calls ${[...new Set(feeding)].join(", ")}, which feed a decision about a person or company; say where the person stays in the loop (human).`);
    const prices = steps.map((s) => s.priceCents);
    const totalCents = prices.every((p): p is number => p !== null) ? prices.reduce((a, b) => a + b, 0) : null;
    return { ...u, steps, oneCall, totalCents };
  });
}
