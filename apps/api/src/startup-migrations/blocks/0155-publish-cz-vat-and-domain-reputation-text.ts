import { sql, type SQL } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0155 — publish the cz-unreliable-vat-payer and domain-reputation
 * manifest text (promise-audit T1 follow-ups 26 and 28, 2026-11-12).
 *
 * Both are compliance-category capabilities, so the boot-time manifest text
 * sync (lib/manifest-text-sync.ts) only reports their drift and never writes
 * it (`isReportOnly`, manifest-publication-policy.ts). Their corrected text
 * reaches production only through a block like this one.
 *
 * Approval: Petter, in session 2026-11-12, session_01CR5YPrMeBAwfKDjk6t8L9H,
 * answering 'publish both' to the request to publish the
 * cz-unreliable-vat-payer and domain-reputation limitation text.
 *
 * What is published, and why only this:
 *  - cz-unreliable-vat-payer (wave 3, #1023): the limitation that a DIČ the
 *    register answers NENALEZEN ("not found") comes back as not registered
 *    with dic, is_unreliable_payer and financial_office_code null, and the
 *    output types that let those three fields be null. The limitation rows
 *    become exactly the four of the manifest, which also publishes the first
 *    row's rewritten title, never published for the same reason.
 *  - domain-reputation (wave 4, #1025): the limitations rewritten to what the
 *    executor does now (a temporary DNS failure no longer lowers the score; an
 *    anti-bot challenge marked by cf-mitigated fails unbilled; a ToS-listed
 *    domain, a restricted address and a redirect Strale does not follow fail
 *    unbilled), and its output_schema, whose manifest example differs from the
 *    stored one. Narrowing only (DEC-20260822-A part 2).
 *  The other text columns the sync owns (TEXT_COLUMNS: name, description,
 *  category, data_source, input_schema) already equal the manifests: read from
 *  GET /v1/capabilities/<slug> on 2026-11-12. output_field_reliability is not
 *  public and its manifest entries did not change, so it is left alone; the
 *  boot sync's `manifest-text-report-only` log after deploy names any field
 *  that still differs.
 *
 * Approach: the text is frozen here as constants, and SQL is written by hand
 * as in block 0143, rather than calling the sync's own `textPayload` and
 * `diffAndUpdateLimitations` at boot. Reasons: the approval is for this exact
 * text, and a block that read manifests/*.yaml when it runs would publish
 * whatever the files say on the day it deploys; `diffAndUpdateLimitations`
 * needs a Drizzle query builder, while a block gets only `execute`; and the
 * runner gives a block no transaction, so each slug is published in one
 * statement (data-modifying CTEs), which commits or fails as a whole and can
 * never leave the slug with a half-replaced limitation list. The test proves
 * the constants equal what the sync's own `textPayload` derives from each
 * manifest, so the published rows are exactly what the sync would write. The
 * block declares its own file as migration data, so the ledger hash covers
 * these constants, not only the function body.
 *
 * Per slug, one statement:
 *  - capabilities.output_schema = the manifest's, guarded by IS DISTINCT FROM.
 *    Where the manifest has no example (cz-unreliable-vat-payer), a stored
 *    example is kept, as the sync's `withRuntimeExample` does;
 *  - capability_limitations with the effect of `diffAndUpdateLimitations`
 *    (capability-persistence.ts): active rows not in the manifest are deleted,
 *    missing ones inserted with sort_order = manifest position, kept ones that
 *    moved get the new sort_order. Inactive rows are left alone. Skipped when
 *    the capability row does not exist (a fresh database is onboarded from the
 *    manifest).
 *
 * manifest_text_hash is not set: the sync ignores it for a report-only row
 * and compares the values themselves, which this block makes equal, so the
 * drift report stops without it. No updated_at is written, on capabilities
 * (invariant-checker.ts reads it as "the capability changed"; a copy-only
 * change must not move it, as in blocks 0123 and 0143) or on limitations
 * (diffAndUpdateLimitations sets it on a reorder; nothing reads it).
 *
 * Run policy "once": a re-run must not undo a later edit. Every part is also
 * idempotent on its own (a second run matches nothing). Rows touched: two
 * capabilities and at most fifteen limitation rows; no bulk operation
 * (DEC-20260504-B). Only strings and integers are bound; no Date reaches a sql
 * template (DEC-20260504-A).
 */

export interface Limitation0155 {
  title: string;
  limitationText: string;
  category: string;
  severity: string;
  workaround: string | null;
}

export interface Publication0155 {
  slug: string;
  /** The manifest's output_schema, exactly. */
  outputSchema: Record<string, unknown>;
  /** In manifest order; the array index is the sort_order. */
  limitations: readonly Limitation0155[];
}

export const CZ_VAT_PAYER_0155: Publication0155 = {
  slug: "cz-unreliable-vat-payer",
  outputSchema: {
    type: "object",
    properties: {
      input_dic: { type: "string" },
      dic: { type: ["string", "null"] },
      is_registered_vat_payer: { type: "boolean" },
      is_unreliable_payer: { type: ["boolean", "null"] },
      financial_office_code: { type: ["string", "null"] },
      published_accounts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            published_at: { type: "string" },
            account_number: { type: "string" },
            bank_code: { type: ["string", "null"] },
            is_standard: { type: "boolean" },
          },
        },
      },
      published_account_count: { type: "integer" },
      response_generated_at: { type: ["string", "null"] },
      joint_liability_risk: { type: "string" },
    },
  },
  limitations: [
    {
      title: "DIČ is required; it is not inferred from IČO",
      limitationText:
        "Input is treated as DIČ (with or without CZ prefix). Natural-person DIČs may be 9-10 digits (based on rodné číslo) and are not derivable from IČO alone.",
      category: "coverage",
      severity: "info",
      workaround: "For legal entities, use the 8-digit IČO; the service accepts bare digits.",
    },
    {
      title: "Not a liveness check on the bank account",
      limitationText:
        "Published accounts are what the VAT payer registered with MF ČR. The service does not confirm the account is currently open or held by the named bank.",
      category: "accuracy",
      severity: "info",
      workaround: null,
    },
    {
      title: "A DIČ not in the VAT-payer register is not explained further",
      limitationText:
        "A DIČ the register does not find among VAT payers is returned as is_registered_vat_payer false, with dic, is_unreliable_payer and financial_office_code null. The register's answer does not say why: the DIČ may belong to an identified person, a deregistered payer, a member of a VAT group invoicing under the group's DIČ, or an unreliable person (nespolehlivá osoba), or it may not exist.",
      category: "coverage",
      severity: "info",
      workaround: "If the invoice charges Czech VAT, ask the supplier which DIČ it is registered under and check that one.",
    },
    {
      title: "Status snapshot only — history not returned",
      limitationText:
        "The check returns the current unreliable-payer flag as of the response_generated_at date. Historical changes (when the flag was set/cleared) are not exposed.",
      category: "coverage",
      severity: "info",
      workaround: null,
    },
  ],
};

export const DOMAIN_REPUTATION_0155: Publication0155 = {
  slug: "domain-reputation",
  outputSchema: {
    type: "object",
    example: {
      grade: "A",
      checks: {
        has_mx: true,
        has_csp: false,
        has_spf: true,
        has_xfo: true,
        has_hsts: false,
        has_xcto: false,
        mx_count: 1,
        resolves: true,
        has_dmarc: true,
        https_works: true,
        https_status: 200,
        ip_addresses: [
          "172.253.63.139",
          "172.253.63.102",
          "172.253.63.100",
          "172.253.63.113",
          "172.253.63.138",
          "172.253.63.101",
        ],
      },
      domain: "google.com",
      issues: ["No HSTS header", "No X-Content-Type-Options header"],
      issue_count: 2,
      reputation_score: 92,
    },
    properties: {
      grade: { type: "string" },
      checks: { type: "object" },
      domain: { type: "string" },
      issues: { type: "array" },
      reputation_score: { type: "integer" },
    },
  },
  limitations: [
    {
      title: "No blocklist or threat-intelligence lookup",
      limitationText:
        "The score comes only from the domain's DNS records (A, MX, SPF, DMARC), a header-only HTTPS request to the domain's home page (following up to three redirects) for security headers, and name patterns such as suspicious TLDs. It does not consult blocklists, threat-intelligence feeds or domain age, so a high score does not mean the domain is safe.",
      category: "accuracy",
      severity: "warning",
      workaround:
        "For phishing or malware screening, combine this with a dedicated blocklist or threat-intelligence source; use whois-lookup for domain age",
    },
    {
      title: "Computed live on every call",
      limitationText:
        "Every call reads the domain's current DNS records and HTTPS response, so a fixed record shows at once. If the domain's HTTPS connection fails, a TLS certificate error included, or the domain does not answer within 8 seconds, the check reports its HTTPS as failing (https_works false) and lowers the score for that call. If a DNS lookup fails without an answer (a timeout or server failure, rather than \"no such record\"), or Strale's own resolver fails temporarily while connecting over HTTPS, the call fails unbilled instead of lowering the score.",
      category: "freshness",
      severity: "info",
      workaround:
        "If a result looks wrong for a domain that normally works, re-run the check before acting on the score; a call that failed on a DNS lookup can be retried",
    },
    {
      title: "An anti-bot challenge fails the call, with no score",
      limitationText:
        "If the domain, or the site it redirects to, answers with an anti-bot challenge marked by the cf-mitigated: challenge response header, the call fails unbilled and returns no score, because those headers belong to the challenge page, not the site. The check reads headers only, never the page itself, so a challenge that is not marked by that header is not recognised, and the domain is then graded on the challenge page's headers.",
      category: "accuracy",
      severity: "info",
      workaround: "Check the site's security headers another way, for example in a browser's developer tools",
    },
    {
      title: "Some domains are not checked",
      limitationText:
        "The call fails unbilled, with no score, when Strale will not make the HTTPS request: for a domain on Strale's list of sites whose terms forbid automated access or that redirects to one, a domain that resolves or redirects to a private or otherwise restricted network address, or a domain that redirects to an address Strale does not follow, such as an ftp:// link.",
      category: "coverage",
      severity: "info",
      workaround: null,
    },
  ],
};

/** In run order. */
export const PUBLICATIONS_0155: readonly Publication0155[] = [CZ_VAT_PAYER_0155, DOMAIN_REPUTATION_0155];

export async function runMigration0155_publishCzVatAndDomainReputationText(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  // The constants above are this block's data: declaring this file puts its
  // whole text under the ledger hash, so editing them is a hash mismatch.
  // migration-data: apps/api/src/startup-migrations/blocks/0155-publish-cz-vat-and-domain-reputation-text.ts
  const startedAt = Date.now();
  let total = 0;
  const parts: string[] = [];
  for (const p of PUBLICATIONS_0155) {
    const schema = JSON.stringify(p.outputSchema);
    // A manifest without an example keeps the stored one, as the sync's
    // withRuntimeExample does (lib/capability-field-authority.ts).
    // `-> 'example'` is SQL NULL only when the key is absent.
    const newSchema: SQL =
      "example" in p.outputSchema
        ? sql`${schema}::jsonb`
        : sql`(CASE WHEN output_schema -> 'example' IS NOT NULL
                    THEN ${schema}::jsonb || jsonb_build_object('example', output_schema -> 'example')
                    ELSE ${schema}::jsonb END)`;
    const keep = sql.join(
      p.limitations.map((l) => sql`(${l.title}, ${l.limitationText}, ${l.category}, ${l.severity}, ${l.workaround}::text)`),
      sql`, `,
    );
    const wanted = sql.join(
      p.limitations.map(
        (l, i) => sql`(${i}::int, ${l.title}, ${l.limitationText}, ${l.category}, ${l.severity}, ${l.workaround}::text)`,
      ),
      sql`, `,
    );

    const schemaUpdate = sql`UPDATE capabilities SET output_schema = ${newSchema}
       WHERE slug = ${p.slug}
         AND output_schema IS DISTINCT FROM ${newSchema}
      RETURNING 1`;
    // Active rows that are not one of the manifest's, compared on every
    // field the sync compares.
    const deleteRemoved = sql`DELETE FROM capability_limitations cl
       WHERE cl.capability_slug = ${p.slug}
         AND cl.active = true
         AND EXISTS (SELECT 1 FROM capabilities c WHERE c.slug = ${p.slug})
         AND NOT EXISTS (
           SELECT 1 FROM (VALUES ${keep}) AS k(title, limitation_text, category, severity, workaround)
            WHERE k.title IS NOT DISTINCT FROM cl.title
              AND k.limitation_text = cl.limitation_text
              AND k.category = cl.category
              AND k.severity = cl.severity
              AND k.workaround IS NOT DISTINCT FROM cl.workaround
         )
      RETURNING 1`;
    const insertMissing = sql`INSERT INTO capability_limitations (capability_slug, title, limitation_text, category, severity, workaround, sort_order)
      SELECT ${p.slug}, w.title, w.limitation_text, w.category, w.severity, w.workaround, w.sort_order
        FROM (VALUES ${wanted}) AS w(sort_order, title, limitation_text, category, severity, workaround)
       WHERE EXISTS (SELECT 1 FROM capabilities c WHERE c.slug = ${p.slug})
         AND NOT EXISTS (
           SELECT 1 FROM capability_limitations cl
            WHERE cl.capability_slug = ${p.slug}
              AND cl.active = true
              AND cl.title IS NOT DISTINCT FROM w.title
              AND cl.limitation_text = w.limitation_text
              AND cl.category = w.category
              AND cl.severity = w.severity
              AND cl.workaround IS NOT DISTINCT FROM w.workaround
         )
      RETURNING 1`;
    const reorderKept = sql`UPDATE capability_limitations cl SET sort_order = w.sort_order
        FROM (VALUES ${wanted}) AS w(sort_order, title, limitation_text, category, severity, workaround)
       WHERE cl.capability_slug = ${p.slug}
         AND cl.active = true
         AND cl.title IS NOT DISTINCT FROM w.title
         AND cl.limitation_text = w.limitation_text
         AND cl.category = w.category
         AND cl.severity = w.severity
         AND cl.workaround IS NOT DISTINCT FROM w.workaround
         AND cl.sort_order IS DISTINCT FROM w.sort_order
      RETURNING 1`;
    // One statement, so the slug's schema and limitations commit together.
    // Every CTE reads the table as it was before the statement: the rows the
    // delete removes are exactly the active rows not in the manifest, and the
    // reorder touches only rows that are, so no row is written twice.
    const rows = (await tx.execute(sql`
      WITH schema_updated AS (${schemaUpdate}),
           deleted AS (${deleteRemoved}),
           inserted AS (${insertMissing}),
           reordered AS (${reorderKept})
      SELECT (SELECT count(*) FROM schema_updated)::int AS schema_updated,
             (SELECT count(*) FROM deleted)::int AS deleted,
             (SELECT count(*) FROM inserted)::int AS inserted,
             (SELECT count(*) FROM reordered)::int AS reordered
    `)) as unknown as Array<{ schema_updated: number; deleted: number; inserted: number; reordered: number }>;
    const counts = [rows[0]?.schema_updated, rows[0]?.deleted, rows[0]?.inserted, rows[0]?.reordered].map((v) => Number(v ?? 0));
    total += counts.reduce((a, b) => a + b, 0);
    parts.push(`${p.slug} (output_schema ${counts[0]}, limitations -${counts[1]}/+${counts[2]}/~${counts[3]})`);
  }
  return {
    block: "0155_publishCzVatAndDomainReputationText",
    outcome:
      total === 0
        ? "no change (cz-unreliable-vat-payer and domain-reputation text already published)"
        : `manifest text published: ${parts.join("; ")}`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}
