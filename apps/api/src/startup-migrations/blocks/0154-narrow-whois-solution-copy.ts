import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";
import { DOMAIN_TRUST_NEW_LONG_DESCRIPTION } from "./0143-publish-domain-reputation-text.js";

/**
 * Block 0154 — narrow the WHOIS and phishing claims in solution copy
 * (2026-11-11, PR #1018 review round 4, T1 and T5).
 *
 * whois-lookup now asks only the TLD's own registry server, for about 38
 * TLDs, and refuses any other TLD (2026-11-06 swallowed-failures audit, row
 * 28). Five solutions that run it still promised WHOIS data for any domain,
 * and Domain Trust Check still told the search router and its audience
 * that it does phishing detection, although no step consults a blocklist.
 * PR #1018 corrects db/solution-catalogue.ts; this block delivers the same
 * text to the live rows. The catalogue reaches production only through
 * seed-solutions.ts, a manual script, so without the block the live copy
 * would keep the wider claims.
 *
 * Every statement is a guarded UPDATE of one column, row by row, each row
 * matched on its slug and the exact text it replaces, so a later edit is never
 * overwritten and a second run writes 0 rows:
 *  - domain-trust long_description, from the text block 0143 published;
 *  - domain-trust target_audience and agent_description, and the registrar
 *    in its example_output (IANA was what the old whois fallback returned
 *    for the TLD; example.com's registry record names "RESERVED-Internet
 *    Assigned Numbers Authority");
 *  - long_description of domain-intel, vendor-risk-assess, lead-enrich and
 *    company-intelligence-sdr ("WHOIS" gains "for domains under common TLDs").
 *
 * The guarded "from" texts are the catalogue's, unchanged in the repository
 * since March and April 2026 (git log -S); seed-solutions.ts writes them and
 * no earlier block touches these columns of these rows, apart from 0143's
 * domain-trust long_description, which is the guard used here. Production
 * was not queried for this block. If a live row holds other text, its
 * statement writes 0 rows, and the post-deploy check in the PR shows it.
 *
 * Narrowing only (DEC-20260822-A part 2). solutions.updated_at is not
 * written (a copy-only change; same rule as blocks 0123 and 0143). Rows
 * touched: at most five solutions; no bulk operation (DEC-20260504-B). Only
 * strings are bound; no Date reaches a sql template (DEC-20260504-A).
 */
export const WHOIS_COPY_DOMAIN_TRUST_SLUG = "domain-trust";

type TextColumn = "long_description" | "target_audience" | "agent_description";

export interface GuardedTextUpdate {
  slug: string;
  column: TextColumn;
  from: string;
  to: string;
}

export const WHOIS_COPY_TEXT_UPDATES: readonly GuardedTextUpdate[] = [
  {
    slug: "domain-trust",
    column: "long_description",
    from: DOMAIN_TRUST_NEW_LONG_DESCRIPTION,
    to: "Checks five trust signals for a domain: WHOIS registration age and registrar (for domains under common TLDs), DNS configuration health, SSL certificate validity, a DNS-and-HTTPS hygiene score (no blocklist or threat-intelligence lookup), and HTTP security header grade. Use as one input to link safety checks and brand protection; for phishing screening, pair it with a dedicated blocklist, since a good result does not show a domain is safe.",
  },
  {
    slug: "domain-trust",
    column: "target_audience",
    from: "Anti-fraud teams, brand protection, phishing detection, or cybersecurity agents",
    to: "Anti-fraud teams, brand protection, link safety, or cybersecurity agents",
  },
  {
    slug: "domain-trust",
    column: "agent_description",
    from: "is this domain trustworthy, check domain trust, domain reputation check, is this website safe to visit, phishing check, link safety verification, should I trust this domain",
    to: "is this domain trustworthy, check domain trust, domain hygiene check, domain registration age and registrar, domain SSL and security headers, link safety input, should I trust this domain",
  },
  {
    slug: "domain-intel",
    column: "long_description",
    from: "Combines WHOIS registration data, DNS record analysis, SSL certificate validation, and domain reputation scoring into one report. Use when your agent is researching a company, vetting a vendor, qualifying a lead, or checking a link before following it.",
    to: "Combines WHOIS registration data (for domains under common TLDs), DNS record analysis, SSL certificate validation, and domain reputation scoring into one report. Use when your agent is researching a company, vetting a vendor, qualifying a lead, or checking a link before following it.",
  },
  {
    slug: "vendor-risk-assess",
    column: "long_description",
    from: "Checks a company across 7 data sources in one call: SEC EDGAR, OFAC/EU/UN sanctions, WHOIS, DNS, SSL, domain reputation, and HTTP security headers. All steps run in parallel, quality-verified before delivery. Use before onboarding a vendor, signing a partnership, or approving a procurement request.",
    to: "Checks a company across 7 data sources in one call: SEC EDGAR, OFAC/EU/UN sanctions, WHOIS (for domains under common TLDs), DNS, SSL, domain reputation, and HTTP security headers. All steps run in parallel, quality-verified before delivery. Use before onboarding a vendor, signing a partnership, or approving a procurement request.",
  },
  {
    slug: "lead-enrich",
    column: "long_description",
    from: "Starting from just an email address: validates deliverability, checks DNS records, scores domain reputation, looks up WHOIS registration data, and detects the company's technology stack. Returns everything an outbound agent needs to qualify a prospect and personalize outreach. Use in CRM enrichment, SDR automation, or account research pipelines.",
    to: "Starting from just an email address: validates deliverability, checks DNS records, scores domain reputation, looks up WHOIS registration data (for domains under common TLDs), and detects the company's technology stack. Returns everything an outbound agent needs to qualify a prospect and personalize outreach. Use in CRM enrichment, SDR automation, or account research pipelines.",
  },
  {
    slug: "company-intelligence-sdr",
    column: "long_description",
    from: "The complete company research package for AI SDR agents. Given a company name and domain, returns: recent filing events (SEC/Companies House), news sentiment from global media, company officers and directors from public records, technology stack detection, email pattern discovery, social media presence across 11 platforms, domain registration age and registrar (WHOIS), and hiring activity from job boards. Replaces the manual process of querying 9+ APIs separately.",
    to: "The complete company research package for AI SDR agents. Given a company name and domain, returns: recent filing events (SEC/Companies House), news sentiment from global media, company officers and directors from public records, technology stack detection, email pattern discovery, social media presence across 11 platforms, domain registration age and registrar (WHOIS, for domains under common TLDs), and hiring activity from job boards. Replaces the manual process of querying 9+ APIs separately.",
  },
];

export const DOMAIN_TRUST_OLD_EXAMPLE_REGISTRAR = "IANA";
export const DOMAIN_TRUST_NEW_EXAMPLE_REGISTRAR = "RESERVED-Internet Assigned Numbers Authority";

/** One guarded UPDATE per column, over the rows of WHOIS_COPY_TEXT_UPDATES for it. */
function guardedRows(column: TextColumn) {
  return sql.join(
    WHOIS_COPY_TEXT_UPDATES.filter((u) => u.column === column).map((u) => sql`(${u.slug}, ${u.from}, ${u.to})`),
    sql`, `,
  );
}

export async function runMigration0154_narrowWhoisSolutionCopy(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const rowCount = (res: unknown) => (res as { count?: number }).count ?? 0;

  const longDescription = rowCount(
    await tx.execute(sql`
      UPDATE solutions s
         SET long_description = v.to_text
        FROM (VALUES ${guardedRows("long_description")}) AS v(slug, from_text, to_text)
       WHERE s.slug = v.slug
         AND s.long_description = v.from_text
    `),
  );

  const targetAudience = rowCount(
    await tx.execute(sql`
      UPDATE solutions s
         SET target_audience = v.to_text
        FROM (VALUES ${guardedRows("target_audience")}) AS v(slug, from_text, to_text)
       WHERE s.slug = v.slug
         AND s.target_audience = v.from_text
    `),
  );

  const agentDescription = rowCount(
    await tx.execute(sql`
      UPDATE solutions s
         SET agent_description = v.to_text
        FROM (VALUES ${guardedRows("agent_description")}) AS v(slug, from_text, to_text)
       WHERE s.slug = v.slug
         AND s.agent_description = v.from_text
    `),
  );

  const example = rowCount(
    await tx.execute(sql`
      UPDATE solutions
         SET example_output = jsonb_set(example_output, '{registrar}', to_jsonb(${DOMAIN_TRUST_NEW_EXAMPLE_REGISTRAR}::text))
       WHERE slug = ${WHOIS_COPY_DOMAIN_TRUST_SLUG}
         AND example_output ->> 'registrar' = ${DOMAIN_TRUST_OLD_EXAMPLE_REGISTRAR}
    `),
  );

  const total = longDescription + targetAudience + agentDescription + example;
  return {
    block: "0154_narrowWhoisSolutionCopy",
    outcome:
      total === 0
        ? "no change (WHOIS solution copy already narrowed, or edited since)"
        : `WHOIS solution copy narrowed (long_description ${longDescription}, target_audience ${targetAudience}, agent_description ${agentDescription}, example_output ${example})`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}
