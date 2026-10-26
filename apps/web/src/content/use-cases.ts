// Use cases (SITE-STRUCTURE.md pages 7-8): the jobs agents are built to do,
// chosen for that and not for what sells now (DEC-20261023-B). Adding one is a
// content change: add an entry here. test/editorial.test.ts fails when a slug
// here is not a tool in manifests/, or a sketch calls a tool its run does not list.
//
// Prices are never typed: a run's cost and every max_price_cents in a sketch
// come from the live catalogue at build time. A tool that is not visible in the
// catalogue is dropped from the page, with its cost.
import type { JobId } from "./jobs.ts";
import type { BundleKind } from "../lib/company-data.ts";

export interface UseCaseStep {
  slug: string;
  /** What this tool does in the job, in the reader's terms. */
  role: string;
  /** Calls of this tool in the example run (0: listed, not in the run). */
  calls: number;
}

export interface UseCase {
  slug: string;
  title: string;
  /** Card line on /use-cases. */
  summary: string;
  /** The job group whose level-2 line this page carries (MESSAGING-LEVELS.md). */
  job: JobId;
  /** The job, in the reader's terms. */
  intro: string;
  steps: UseCaseStep[];
  /** The bundled check that runs this job in one call, where one exists, and for which country it is shown. */
  bundle?: { kind: BundleKind; country: string; note: string };
  /** One worked example, labelled illustrative on the page. */
  example: { setup: string; run: string[] };
  /** Where a person stays in the loop. Required when a tool in the run produces a screening signal or a risk summary. */
  human?: string;
  /** TypeScript sketch. `price(slug)` is the live price in cents, so the cap in the sketch is never typed. */
  sketch: (price: (slug: string) => number) => string;
}

const client = `import { Strale } from "straleio";\n\nconst strale = new Strale({ apiKey: process.env.STRALE_API_KEY! });\n`;

export const USE_CASES: UseCase[] = [
  {
    slug: "research-agents",
    title: "Research agents",
    summary: "Search the web and scholarly papers, then read the pages the agent picks as clean text.",
    job: "web",
    intro:
      "A research agent has to find sources, read them and decide which ones matter. Search results tell it where to look; the pages themselves are what it reads. Strale gives it both, plus scholarly papers, through one key.",
    steps: [
      { slug: "google-search", role: "Find candidate pages for the question.", calls: 1 },
      { slug: "url-to-markdown", role: "Read each chosen page as markdown the model can work with.", calls: 3 },
      { slug: "academic-paper-search", role: "Find papers on the topic, with authors and citations.", calls: 1 },
      { slug: "serp-analyze", role: "See what ranks for a keyword: snippets, questions people ask, result features.", calls: 0 },
    ],
    example: {
      setup: "An agent is asked for a short brief on how EU instant-payment rules affect small online shops.",
      run: [
        "It searches for the regulation and recent coverage, and gets a ranked list of pages.",
        "It reads the three most relevant pages as markdown and quotes from them.",
        "It looks for papers on instant-payment adoption to back the brief with research.",
      ],
    },
    sketch: (price) => `${client}
const search = await strale.do({
  capability_slug: "google-search",
  inputs: { query: "EU instant payments regulation small merchants" },
  max_price_cents: ${price("google-search")},
});

const results = search.output.results as { url: string; title: string }[];
for (const r of results.slice(0, 3)) {
  const page = await strale.do({
    capability_slug: "url-to-markdown",
    inputs: { url: r.url },
    max_price_cents: ${price("url-to-markdown")},
  });
  // page.output.markdown goes into the model's context
}`,
  },
  {
    slug: "reading-documents",
    title: "Reading documents",
    summary: "Pull text from images and the fields from invoices, receipts and PDFs.",
    job: "documents",
    intro:
      "Agents that handle paperwork need what is written on it, as fields they can act on: who sent the invoice, how much, by when. These tools take a document by URL or as text and return structured fields. An AI model reads the document, so the agent should check the fields it acts on.",
    steps: [
      { slug: "invoice-extract", role: "Read a supplier invoice: vendor, VAT number, amounts, due date, IBAN, line items.", calls: 1 },
      { slug: "receipt-categorize", role: "Read a receipt and file it under an expense category.", calls: 2 },
      { slug: "pdf-extract", role: "Pull structured data out of any other PDF.", calls: 0 },
      { slug: "image-to-text", role: "Read the text in a photo or scan.", calls: 0 },
    ],
    example: {
      setup: "A bookkeeping agent gets a supplier invoice as a PDF link and two receipts pasted as text.",
      run: [
        "It reads the invoice and gets the vendor, amount, VAT and due date as fields.",
        "It reads each receipt and gets an expense category and a total.",
        "It drafts the bookkeeping entries for a person to approve.",
      ],
    },
    sketch: (price) => `${client}
const invoice = await strale.do({
  capability_slug: "invoice-extract",
  inputs: { url: "https://example.com/invoices/2026-104.pdf" },
  max_price_cents: ${price("invoice-extract")},
});

const { vendor_name, total_amount, currency, due_date } = invoice.output;
// invoice.output.confidence says how sure the model is of each field`,
  },
  {
    slug: "checking-data",
    title: "Checking data before acting",
    summary: "Check an email address, phone number, IBAN format and EU VAT number before the agent uses them.",
    job: "check",
    intro:
      "An agent that sends an email, books a call or pays an invoice should check the detail first. A failed check costs a cent or two; acting on a bad address or number costs more. These checks are computed by fixed rules and lookups, not written by an AI model.",
    steps: [
      { slug: "email-validate", role: "Check the address format and that the domain receives mail; flag disposable addresses.", calls: 1 },
      { slug: "phone-validate", role: "Check a phone number and return it in international format.", calls: 1 },
      { slug: "iban-validate", role: "Check an IBAN’s format and check digits, and read the bank code. It does not show that the account exists.", calls: 1 },
      { slug: "vat-validate", role: "Look up an EU VAT number in the EU’s VIES service, with the registered name where VIES returns it.", calls: 1 },
    ],
    example: {
      setup: "A sales agent is about to save a new customer from a web form: an email address, a phone number, an IBAN for direct debit and a VAT number.",
      run: [
        "It checks the email domain receives mail and is not a disposable one.",
        "It normalises the phone number to international format.",
        "It checks the IBAN’s check digits, so a typo is caught before the first debit.",
        "It looks up the VAT number and compares the registered name with the form.",
      ],
    },
    sketch: (price) => `${client}
const [email, vat] = await Promise.all([
  strale.do({
    capability_slug: "email-validate",
    inputs: { email: "anna@example.se" },
    max_price_cents: ${price("email-validate")},
  }),
  strale.do({
    capability_slug: "vat-validate",
    inputs: { vat_number: "SE556703748501" },
    max_price_cents: ${price("vat-validate")},
  }),
]);

if (!email.output.valid || !vat.output.valid) {
  // ask the customer to correct the form before saving
}`,
  },
  {
    slug: "supplier-onboarding",
    title: "Onboarding a supplier or customer",
    summary: "Look the company up in its country’s records, then screen it against sanctions, PEP lists and adverse media.",
    job: "company",
    intro:
      "Before an agent adds a new supplier or business customer, someone has to know the company exists, is active, and is not on a sanctions list. The agent can look the company up where it is registered and screen the company and the people behind it, step by step or as one bundled check at one price.",
    steps: [
      { slug: "swedish-company-data", role: "Look the company up in its country’s records: name, number, status, address. This example uses Sweden.", calls: 1 },
      { slug: "sanctions-check", role: "Screen the company name against consolidated sanctions lists.", calls: 1 },
      { slug: "pep-check", role: "Check whether a director is a politically exposed person.", calls: 1 },
      { slug: "adverse-media-check", role: "Look for news coverage of fraud, corruption and similar risk categories.", calls: 1 },
    ],
    bundle: { kind: "company-check", country: "se", note: "The bundled company check runs the lookup and screening in one call at one price and returns each step’s result." },
    example: {
      setup: "A procurement agent is asked to add a Swedish supplier, given its organisation number and the name of its managing director.",
      run: [
        "It looks the number up and confirms the company is registered and active, and the name matches.",
        "It screens the company name against sanctions lists and finds no match.",
        "It checks the director against PEP lists and finds a possible match on a similar name.",
        "It holds the onboarding and asks a person to review the possible match.",
      ],
    },
    human:
      "Screening returns possible matches, not findings. A similar name is not the same person, so a person reviews any match before the agent turns a supplier away or holds a payment. Strale classifies these tools as screening signals under GDPR Article 22; a result from an API call can be disputed for review by a person.",
    sketch: (price) => `${client}
const company = await strale.do({
  capability_slug: "swedish-company-data",
  inputs: { org_number: "556703-7485" },
  max_price_cents: ${price("swedish-company-data")},
});

const sanctions = await strale.do({
  capability_slug: "sanctions-check",
  inputs: { name: company.output.company_name },
  max_price_cents: ${price("sanctions-check")},
});

if (company.output.status !== "active" || sanctions.output.match_count) {
  // stop and ask a person to review before onboarding
}`,
  },
  {
    slug: "invoice-issuer-check",
    title: "Checking who issued an invoice",
    summary: "Read an invoice, then check the issuer’s VAT number, IBAN format and company record before paying.",
    job: "company",
    intro:
      "Invoices from a new or changed supplier are where payment fraud starts: a real-looking invoice with a different bank account. Before an agent queues a payment, it can read the invoice and check that the issuer and its details hold up.",
    steps: [
      { slug: "invoice-extract", role: "Read the invoice: issuer name, VAT number, IBAN, amount.", calls: 1 },
      { slug: "vat-validate", role: "Look the issuer’s VAT number up in VIES and compare the registered name.", calls: 1 },
      { slug: "iban-validate", role: "Check the IBAN’s format and check digits and read the bank code.", calls: 1 },
      { slug: "swedish-company-data", role: "Look the issuer up in its country’s records. This example uses Sweden.", calls: 1 },
    ],
    bundle: { kind: "invoice-check", country: "se", note: "The bundled invoice-issuer check runs these checks in one call at one price and returns each step’s result." },
    example: {
      setup: "An accounts-payable agent receives an invoice from a Swedish supplier whose bank details differ from the last one.",
      run: [
        "It reads the invoice and gets the issuer, VAT number, IBAN and amount.",
        "It finds the VAT number valid and registered to the same company name.",
        "It finds the IBAN well formed, but at a different bank from the supplier’s earlier invoices.",
        "It holds the payment and asks a person to confirm the new account with the supplier.",
      ],
    },
    human:
      "The checks show whether the details are consistent; they do not prove an invoice is genuine, and an IBAN check does not show who holds the account. A person decides whether to pay.",
    sketch: (price) => `${client}
const invoice = await strale.do({
  capability_slug: "invoice-extract",
  inputs: { url: "https://example.com/invoices/inv-2291.pdf" },
  max_price_cents: ${price("invoice-extract")},
});

const { vendor_vat, iban } = invoice.output as { vendor_vat?: string; iban?: string };
const vat = vendor_vat
  ? await strale.do({
      capability_slug: "vat-validate",
      inputs: { vat_number: vendor_vat },
      max_price_cents: ${price("vat-validate")},
    })
  : null;
// compare vat?.output.company_name with invoice.output.vendor_name, then check the IBAN`,
  },
  {
    slug: "seo-and-web-agents",
    title: "SEO and web agents",
    summary: "Audit a page for SEO, see what technology a site runs on, and check its DNS and certificate.",
    job: "developer",
    intro:
      "Agents that look after websites, or size up someone else’s, need the same checks a developer would run by hand: what the page gets wrong for search, what it is built with, whether mail and DNS are set up, and when the certificate expires.",
    steps: [
      { slug: "seo-audit", role: "Audit a page’s titles, headings and meta tags, with fixes in priority order.", calls: 1 },
      { slug: "company-tech-stack", role: "Detect the framework, hosting, CDN and analytics a site uses.", calls: 1 },
      { slug: "dns-lookup", role: "Read DNS records and check that SPF and DMARC are set.", calls: 1 },
      { slug: "ssl-check", role: "Read the certificate and how many days are left before it expires.", calls: 1 },
      { slug: "serp-analyze", role: "See what ranks for the site’s main keyword.", calls: 0 },
    ],
    example: {
      setup: "A web agent runs a monthly check of a client’s site and writes a short report.",
      run: [
        "It audits the home page and lists the three fixes that matter most.",
        "It records the hosting provider and framework, to notice when they change.",
        "It finds DMARC missing from the domain’s DNS and flags it.",
        "It notes the certificate expires in 21 days and adds a reminder.",
      ],
    },
    sketch: (price) => `${client}
const [audit, ssl] = await Promise.all([
  strale.do({
    capability_slug: "seo-audit",
    inputs: { url: "https://example.com" },
    max_price_cents: ${price("seo-audit")},
  }),
  strale.do({
    capability_slug: "ssl-check",
    inputs: { domain: "example.com" },
    max_price_cents: ${price("ssl-check")},
  }),
]);

const fixes = audit.output.prioritized_fixes;
const daysLeft = ssl.output.days_until_expiry;`,
  },
];
