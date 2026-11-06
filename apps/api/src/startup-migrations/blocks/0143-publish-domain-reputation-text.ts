import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0143 — publish the narrowed domain-reputation text (2026-11-06).
 *
 * `domain-reputation` computes its score from DNS records (A, MX, SPF,
 * DMARC), one HTTPS request for security headers, and domain-name patterns.
 * It consults no blocklist and no threat-intelligence feed, yet production
 * still says "Threat intelligence feeds (multi-source scoring)" and carries
 * two limitations that talk about blocklists. PR #927 corrects the manifest,
 * the limitations seed and the `domain-trust` solution copy. This block
 * delivers the same text to the live rows.
 *
 * Why a block: the boot-time manifest text sync (lib/manifest-text-sync.ts)
 * deliberately refuses compliance-category capabilities
 * (`isReportOnly`, manifest-publication-policy.ts) until Petter approves.
 * Approval: Petter, in session 2026-11-06, orchestrator session
 * session_01CR5YPsTtEwE3tRQtvTzerw, answering "1. Publish domain-reputation"
 * to "Publish the corrected domain-reputation text ... compliance tools need
 * your OK even for a narrowing". The change only narrows a claim
 * (DEC-20260822-A part 2).
 *
 * Writes, each scoped to the one slug `domain-reputation` or `domain-trust`:
 *  - capabilities.data_source, guarded by IS DISTINCT FROM the new text;
 *  - capability_limitations: the active rows of domain-reputation become
 *    exactly the two limitations of manifests/domain-reputation.yaml, with
 *    the effect of `diffAndUpdateLimitations` (capability-persistence.ts):
 *    active rows not in the manifest are deleted, missing ones inserted with
 *    sort_order = manifest position, moved ones get the new sort_order.
 *    Inactive rows are left alone, as the helper leaves them;
 *  - solutions.long_description of `domain-trust`, guarded on the exact
 *    production text of 2026-11-06, so a later edit is never overwritten.
 *
 * capabilities.updated_at is deliberately not written: invariant-checker.ts
 * reads it as "the capability changed" (stale known_answer ground truth), and
 * a copy-only change must not move it (same rule as block 0123). The same
 * goes for solutions.updated_at.
 *
 * The text below must equal manifests/domain-reputation.yaml and the
 * `domain-trust` entry of db/solution-catalogue.ts (PR #927) exactly; the
 * test asserts it against the manifest once that PR is merged.
 *
 * Run policy "once": a re-run must not undo a later edit. Every statement is
 * also idempotent on its own (a second run writes 0 rows). Rows touched: one
 * capability, two limitations (plus the old ones deleted), one solution; no
 * bulk operation (DEC-20260504-B). Only strings and integers are bound; no
 * Date reaches a sql template (DEC-20260504-A).
 */
export const DOMAIN_REPUTATION_SLUG = "domain-reputation";
export const DOMAIN_TRUST_SLUG = "domain-trust";

export const DOMAIN_REPUTATION_NEW_DATA_SOURCE =
  "DNS records (A, MX, SPF, DMARC) and the domain's HTTPS security headers, plus domain-name pattern checks; no threat-intelligence feeds or blocklists";

export interface DomainReputationLimitation {
  title: string;
  limitationText: string;
  category: string;
  severity: string;
  workaround: string;
}

/** In manifest order; the array index is the sort_order. */
export const DOMAIN_REPUTATION_LIMITATIONS: readonly DomainReputationLimitation[] = [
  {
    title: "No blocklist or threat-intelligence lookup",
    limitationText:
      "The score comes only from the domain's DNS records (A, MX, SPF, DMARC), one HTTPS request for security headers, and name patterns such as suspicious TLDs. It does not consult blocklists, threat-intelligence feeds or domain age, so a high score does not mean the domain is safe.",
    category: "accuracy",
    severity: "warning",
    workaround:
      "For phishing or malware screening, combine this with a dedicated blocklist or threat-intelligence source; use whois-lookup for domain age",
  },
  {
    title: "Computed live on every call",
    limitationText:
      "Every call reads the domain's current DNS and HTTPS responses, so a fixed record shows at once, and a timeout or temporary DNS failure lowers the score for that call only.",
    category: "freshness",
    severity: "info",
    workaround: "If a result looks wrong for a domain that normally works, re-run the check before acting on the score",
  },
];

export const DOMAIN_TRUST_OLD_LONG_DESCRIPTION =
  "Checks five trust signals for any domain: WHOIS registration age and registrar, DNS configuration health, SSL certificate validity, reputation score from threat intelligence feeds, and HTTP security header grade. Use for phishing detection, link safety checks, brand protection, or any time your agent needs to evaluate whether a domain is trustworthy before interacting with it.";
export const DOMAIN_TRUST_NEW_LONG_DESCRIPTION =
  "Checks five trust signals for any domain: WHOIS registration age and registrar, DNS configuration health, SSL certificate validity, a DNS-and-HTTPS hygiene score (no blocklist or threat-intelligence lookup), and HTTP security header grade. Use for phishing detection, link safety checks, brand protection, or any time your agent needs to evaluate whether a domain is trustworthy before interacting with it.";

export async function runMigration0143_publishDomainReputationText(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const rowCount = (res: unknown) => (res as { count?: number }).count ?? 0;

  const dataSource = rowCount(
    await tx.execute(sql`
      UPDATE capabilities
         SET data_source = ${DOMAIN_REPUTATION_NEW_DATA_SOURCE}
       WHERE slug = ${DOMAIN_REPUTATION_SLUG}
         AND data_source IS DISTINCT FROM ${DOMAIN_REPUTATION_NEW_DATA_SOURCE}
    `),
  );

  // Limitations. Skipped when the capability row does not exist (a fresh
  // database: onboarding creates the row and its limitations from the manifest).
  const keep = sql.join(
    DOMAIN_REPUTATION_LIMITATIONS.map(
      (l) => sql`(${l.title}, ${l.limitationText}, ${l.category}, ${l.severity}, ${l.workaround})`,
    ),
    sql`, `,
  );
  const wanted = sql.join(
    DOMAIN_REPUTATION_LIMITATIONS.map(
      (l, i) => sql`(${i}::int, ${l.title}, ${l.limitationText}, ${l.category}, ${l.severity}, ${l.workaround})`,
    ),
    sql`, `,
  );

  const limitationsDeleted = rowCount(
    await tx.execute(sql`
      DELETE FROM capability_limitations cl
       WHERE cl.capability_slug = ${DOMAIN_REPUTATION_SLUG}
         AND cl.active = true
         AND EXISTS (SELECT 1 FROM capabilities c WHERE c.slug = ${DOMAIN_REPUTATION_SLUG})
         AND NOT EXISTS (
           SELECT 1 FROM (VALUES ${keep}) AS k(title, limitation_text, category, severity, workaround)
            WHERE k.title IS NOT DISTINCT FROM cl.title
              AND k.limitation_text = cl.limitation_text
              AND k.category = cl.category
              AND k.severity = cl.severity
              AND k.workaround IS NOT DISTINCT FROM cl.workaround
         )
    `),
  );

  const limitationsInserted = rowCount(
    await tx.execute(sql`
      INSERT INTO capability_limitations
        (capability_slug, title, limitation_text, category, severity, workaround, sort_order)
      SELECT ${DOMAIN_REPUTATION_SLUG}, w.title, w.limitation_text, w.category, w.severity, w.workaround, w.sort_order
        FROM (VALUES ${wanted}) AS w(sort_order, title, limitation_text, category, severity, workaround)
       WHERE EXISTS (SELECT 1 FROM capabilities c WHERE c.slug = ${DOMAIN_REPUTATION_SLUG})
         AND NOT EXISTS (
           SELECT 1 FROM capability_limitations cl
            WHERE cl.capability_slug = ${DOMAIN_REPUTATION_SLUG}
              AND cl.active = true
              AND cl.title IS NOT DISTINCT FROM w.title
              AND cl.limitation_text = w.limitation_text
              AND cl.category = w.category
              AND cl.severity = w.severity
              AND cl.workaround IS NOT DISTINCT FROM w.workaround
         )
    `),
  );

  const limitationsReordered = rowCount(
    await tx.execute(sql`
      UPDATE capability_limitations cl
         SET sort_order = w.sort_order,
             updated_at = now()
        FROM (VALUES ${wanted}) AS w(sort_order, title, limitation_text, category, severity, workaround)
       WHERE cl.capability_slug = ${DOMAIN_REPUTATION_SLUG}
         AND cl.active = true
         AND cl.title IS NOT DISTINCT FROM w.title
         AND cl.limitation_text = w.limitation_text
         AND cl.category = w.category
         AND cl.severity = w.severity
         AND cl.workaround IS NOT DISTINCT FROM w.workaround
         AND cl.sort_order IS DISTINCT FROM w.sort_order
    `),
  );

  const solution = rowCount(
    await tx.execute(sql`
      UPDATE solutions
         SET long_description = ${DOMAIN_TRUST_NEW_LONG_DESCRIPTION}
       WHERE slug = ${DOMAIN_TRUST_SLUG}
         AND long_description = ${DOMAIN_TRUST_OLD_LONG_DESCRIPTION}
    `),
  );

  const total = dataSource + limitationsDeleted + limitationsInserted + limitationsReordered + solution;
  return {
    block: "0143_publishDomainReputationText",
    outcome:
      total === 0
        ? "no change (domain-reputation text already published)"
        : `domain-reputation text published (data_source ${dataSource}, limitations -${limitationsDeleted}/+${limitationsInserted}/~${limitationsReordered}, domain-trust long_description ${solution})`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}
