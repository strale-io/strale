import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// Block 0121 (2026-10-23): Phase 0 catalogue repairs from the portfolio plan
// (docs/strategy/2026-10-23-portfolio-plan.md; Petter in session 2026-10-23:
// "start the Phase 0 repairs"). Four repairs, each verified in production
// read-only on 2026-10-23 before this block was written:
//
// 1. Delist the four Danish bundles. kyb-essentials-dk, kyb-complete-dk,
//    invoice-verify-dk and kyc-denmark (the last on x402) are active, and each
//    has danish-company-data as step 1. That lookup has been quarantined since
//    2026-08-12 (cvrapi.dk free tier exhausted) and completed none of its
//    calls in the last 90 days (197 failed, 0 completed). None of the four had
//    an external customer call in 90 days, so none is a revenue earner.
//    Delisting a bundle that cannot complete follows the quality-floor policy
//    (DEC-20260812-A). Reactivate when the official CVR feed restores Denmark.
//
// 2. Repair kyb-complete-se. Inactive because step 13, credit-report-summary,
//    has been in the DEACTIVATED map since 2026-04-21 (no compliant source).
//    The step row survived the April cleanup (kyb-wiring-audit S-5, 2026-08-12)
//    and the long description still advertises "credit report summary". Remove
//    the step, close the step_order gap (risk-narrative-generate 14 -> 13; the
//    executor sorts by step_order and resolves $steps[N] by position, every SE
//    step refers only to $steps[0] or $input, and the narrative reads
//    $all_results) and correct the copy (as scripts/seed-kyb-solutions.ts now
//    generates it). The bundle is NOT relisted: activation belongs to the shared
//    mayAutoActivateSolution() predicate, which needs a recent passing result
//    for every step, and the paid steps (sanctions, PEP, adverse media, risk
//    narrative) are never scheduled, so they have none. That gap is recorded
//    as a follow-up rather than bypassed here. Every remaining component passes the capability gate
//    with a 100% harness record over the last 7 days.
//
// 3. Put live bundles and tools on the x402 rail. New rows default to
//    x402_enabled = false and these were never switched on: the kyb-essentials,
//    kyb-complete and invoice-verify bundles for AT, GR, HR, IE and SG, and the
//    capabilities cz-unreliable-vat-payer, no-bankruptcy-check and
//    fr-bodacc-lookup. No deliberate exclusion is recorded for any of them, and
//    every component passes the capability gate (is_active, marketplace
//    eligible, lifecycle active, breaker closed) at 100% over the last 7 days.
//
// 4. Narrow over-promising descriptions. The Alchemy app behind the wallet and
//    gas tools serves Ethereum mainnet only (requests for Base failed 3 of 3 as
//    late as 2026-10-18), and job-board-search's France and US keys are not
//    set, so it serves Sweden only. Narrowing public copy to what is served is
//    delegated (DEC-20260822-A); a wider claim returns with the networks/keys.
//
// Every write is guarded on the row's current state, and the block records
// itself in startup_migration_ledger and runs once, so a later operator change
// to any of these flags is never reverted on boot (the block 0092 pattern).
// About 30 rows; not a bulk-operation resumption (DEC-20260504-B).
// Authority: DEC-20260815-A and DEC-20260822-A.

export const PHASE0_DK_BUNDLE_SLUGS = [
  "kyb-essentials-dk",
  "kyb-complete-dk",
  "invoice-verify-dk",
  "kyc-denmark",
] as const;

export const PHASE0_DK_DELIST_REASON =
  "delisted 2026-10-23 (block 0121): step 1 danish-company-data is quarantined (cvrapi.dk free tier exhausted, 0 completed calls in 90 days); reactivate when the official CVR feed restores Denmark";

export const PHASE0_X402_BUNDLE_SLUGS: readonly string[] = ["kyb-essentials", "kyb-complete", "invoice-verify"].flatMap(
  (family) => ["at", "gr", "hr", "ie", "sg"].map((cc) => `${family}-${cc}`),
);

export const PHASE0_X402_CAPABILITY_SLUGS = [
  "cz-unreliable-vat-payer",
  "no-bankruptcy-check",
  "fr-bodacc-lookup",
] as const;

export const KYB_COMPLETE_SE_OLD_LONG_DESCRIPTION =
  "Performs 13 automated checks for Sweden companies: official registry lookup, VAT validation (registry-derived or caller-provided), LEI check, GLEIF L2 UBO supplement (parent ownership for LEI-bearing entities), sanctions screening, PEP screening, adverse media search, domain reputation, WHOIS, SSL, DNS, and email validation plus credit report summary. Produces a dual-output response with structured checks and a human-readable risk narrative.";
export const KYB_COMPLETE_SE_NEW_LONG_DESCRIPTION =
  "Performs 12 automated checks for Sweden companies: official registry lookup, VAT validation (registry-derived or caller-provided), LEI check, GLEIF L2 UBO supplement (parent ownership for LEI-bearing entities), sanctions screening, PEP screening, adverse media search, domain reputation, WHOIS, SSL, DNS, and email validation. Produces a dual-output response with structured checks and a human-readable risk narrative.";

/** slug -> [prefix the current description must start with, narrowed description]. */
export const PHASE0_NARROWED_DESCRIPTIONS: Readonly<Record<string, readonly [string, string]>> = {
  "wallet-balance-lookup": [
    "Get a wallet's native balance and the ERC-20 tokens it most recently sent or received, on Ethereum, Base,",
    "Get a wallet's ETH balance and the ERC-20 tokens it most recently sent or received, on Ethereum mainnet.",
  ],
  "wallet-transactions-lookup": [
    "Get recent native-coin transfers to and from a wallet on Ethereum, Base,",
    "Get recent ETH transfers to and from a wallet on Ethereum mainnet: up to 50 with hash, value, counterparty, timestamp and direction.",
  ],
  "wallet-age-check": [
    "Check when a wallet was first active on Ethereum, Base,",
    "Check when a wallet was first active on Ethereum mainnet: the earliest transfer to or from it, and its age in days. A new wallet moving large amounts is a red flag.",
  ],
  "gas-price-check": [
    "Current gas fees on Ethereum, Polygon or BNB Chain:",
    "Current gas fees on Ethereum mainnet: safe, proposed and fast prices in Gwei plus the base fee, computed from the priority fees actually paid over the last 20 blocks.",
  ],
  "job-board-search": [
    "Search job listings from national public employment services — Sweden (Arbetsförmedlingen), France (France Travail), US federal jobs (USAJOBS).",
    "Search job listings from Sweden's public employment service (Arbetsförmedlingen). Returns title, company, location, salary and URL.",
  ],
};

// A parameterised IN-list. Never `ANY(${array})`: drizzle expands a JS array
// into a row-value tuple that Postgres rejects, which crash-loops boot (see
// block 0092 and lib/internal-accounts.ts).
const phase0InList = (values: readonly string[]) => sql.join(values.map((v) => sql`${v}`), sql`, `);

export async function runMigration0121_phase0CatalogueRepairs(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0121_phase0CatalogueRepairs";

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0
    )`);

  const prior = (await tx.execute(sql`
    SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
  `)) as unknown as Array<{ block: string }>;

  if (prior.length > 0) {
    return {
      block: BLOCK,
      outcome: "no change (already applied once — operator intent is not overwritten)",
      rows_affected: 0,
      duration_ms: Date.now() - startedAt,
    };
  }

  // 1. Delist the Danish bundles.
  const delisted = (await tx.execute(sql`
    UPDATE solutions
       SET is_active = false,
           x402_enabled = false,
           deactivation_reason = ${PHASE0_DK_DELIST_REASON},
           updated_at = now()
     WHERE slug IN (${phase0InList(PHASE0_DK_BUNDLE_SLUGS)})
       AND is_active = true
     RETURNING slug
  `)) as unknown as Array<{ slug: string }>;

  // 2. Repair kyb-complete-se: drop the dead step, close the order gap, fix the copy, relist.
  const removedSteps = (await tx.execute(sql`
    DELETE FROM solution_steps
     WHERE capability_slug = 'credit-report-summary'
       AND solution_id = (SELECT id FROM solutions WHERE slug = 'kyb-complete-se')
     RETURNING id
  `)) as unknown as Array<{ id: string }>;
  // Not conditional on the DELETE: blocks are not one transaction, so after a
  // boot that failed between the two statements the retry's DELETE matches
  // nothing and the renumber must still run. Guarded on slot 13 being free so
  // it can never collide with the unique (solution_id, step_order) index.
  await tx.execute(sql`
    UPDATE solution_steps
       SET step_order = 13
     WHERE capability_slug = 'risk-narrative-generate'
       AND step_order = 14
       AND solution_id = (SELECT id FROM solutions WHERE slug = 'kyb-complete-se')
       AND NOT EXISTS (
         SELECT 1 FROM solution_steps s2
          WHERE s2.solution_id = solution_steps.solution_id AND s2.step_order = 13)
  `);
  // Copy only. The bundle is NOT switched on here: activation belongs to the
  // shared mayAutoActivateSolution() predicate (solution-activation.test.ts
  // fails the build on any other activator).
  const recopied = (await tx.execute(sql`
    UPDATE solutions
       SET long_description = ${KYB_COMPLETE_SE_NEW_LONG_DESCRIPTION},
           updated_at = now()
     WHERE slug = 'kyb-complete-se'
       AND long_description = ${KYB_COMPLETE_SE_OLD_LONG_DESCRIPTION}
     RETURNING slug
  `)) as unknown as Array<{ slug: string }>;

  // 3. Put live bundles and capabilities on the x402 rail.
  const bundlesOnRail = (await tx.execute(sql`
    UPDATE solutions
       SET x402_enabled = true,
           updated_at = now()
     WHERE slug IN (${phase0InList(PHASE0_X402_BUNDLE_SLUGS)})
       AND is_active = true
       AND x402_enabled = false
     RETURNING slug
  `)) as unknown as Array<{ slug: string }>;
  const capsOnRail = (await tx.execute(sql`
    UPDATE capabilities
       SET x402_enabled = true,
           updated_at = now()
     WHERE slug IN (${phase0InList(PHASE0_X402_CAPABILITY_SLUGS)})
       AND is_active = true
       AND visible = true
       AND x402_enabled = false
       AND deactivation_reason IS NULL
     RETURNING slug
  `)) as unknown as Array<{ slug: string }>;

  // 4. Narrow descriptions, only where the row still carries the over-promising copy.
  let narrowed = 0;
  for (const [slug, [oldPrefix, next]] of Object.entries(PHASE0_NARROWED_DESCRIPTIONS)) {
    const res = (await tx.execute(sql`
      UPDATE capabilities
         SET description = ${next},
             updated_at = now()
       WHERE slug = ${slug}
         AND starts_with(description, ${oldPrefix})
       RETURNING slug
    `)) as unknown as Array<{ slug: string }>;
    narrowed += res.length;
  }

  const total =
    delisted.length + removedSteps.length + recopied.length + bundlesOnRail.length + capsOnRail.length + narrowed;

  // Written last: if anything above throws, boot aborts with nothing recorded and the next boot retries.
  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${total})
    ON CONFLICT (block) DO NOTHING
  `);

  return {
    block: BLOCK,
    outcome:
      `${delisted.length} Danish bundle(s) delisted; kyb-complete-se: ${removedSteps.length} dead step removed, ` +
      `${recopied.length} description corrected (bundle stays inactive); ${bundlesOnRail.length} bundle(s) and ${capsOnRail.length} capability(ies) ` +
      `put on x402; ${narrowed} description(s) narrowed`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}
