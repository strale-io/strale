/**
 * The one place a receipt is built for a real execution.
 *
 * ## Why this is a helper and not eight inline blocks
 *
 * `transactions` is written from eight production sites: four executors in
 * `routes/do.ts`, one in `solution-execute.ts`, one in `x402-gateway-v2.ts`,
 * the internal harness in `lib/test-runner.ts`, and the settlement reconciler.
 * There is no natural chokepoint, and building a receipt inline at each would
 * be eight chances to get the binding subtly different.
 *
 * ## Why it can never throw, and never runs inside the money transaction
 *
 * Two rules, and they are the reason this is safe to wire into every rail at
 * once:
 *
 *  1. **It runs after settlement commits.** Every settlement site writes
 *     `status`, `output`/`error` and `audit_trail` inside a wallet
 *     transaction. Receipt construction is not part of that transaction, so it
 *     cannot roll back a payment, cannot extend the lock window, and cannot
 *     turn a receipt bug into a billing bug.
 *  2. **It swallows everything.** A throw here would fail a request that has
 *     already been executed and charged. The row is already `pending` by
 *     database default, so the honest outcome of any failure is "still
 *     pending", which the sweeper retries and the monitoring counts.
 *
 * The combination is what makes the epoch safe: a rail nobody wired, a bug in
 * this file, or a process killed between commit and receipt all converge on
 * the same visible state rather than on a silent absence.
 *
 * ## Why the declaration is re-read here
 *
 * The alternative is threading sixteen columns through four executor
 * signatures. Re-reading by `capability_id` costs one joined query and cannot
 * drift from the column set the digest is defined over. The window in which a
 * capability row could change between execution and this read is the few
 * milliseconds of the settlement commit, and `capabilities` rows are written
 * by onboarding and operations, not per request.
 */

import { sql } from "drizzle-orm";
import type { getDb } from "../../db/index.js";

import {
  buildExecutionReceipt,
  type ReceiptInput,
  type SourceObservation,
  type ExecutionMethod,
  EXECUTION_METHODS,
} from "./execution-receipt.js";
import {
  normalizeCapabilityDeclaration,
  normalizeSolutionDeclaration,
  recordManifestSnapshot,
  type SolutionStepIdentity,
} from "./manifest-snapshot.js";
import { markReceiptComplete, markReceiptFailed } from "./receipt-lifecycle.js";
import { resolveDeployCommit } from "./deploy-identity.js";
import { log } from "../log.js";

type Db = ReturnType<typeof getDb>;

/** Rails that create a customer-visible transaction. Closed, per Phase 2. */
export type SettleRail = "v1_do" | "x402" | "mcp" | "a2a" | "internal";

export interface SettleParams {
  transactionId: string;
  rail: SettleRail;
  /** The solution slug, when this transaction is a solution execution. */
  solutionSlug?: string | null;
  /**
   * The step slugs whose output the caller actually received.
   *
   * The caller supplies only this, not the digests: which steps ran is the one
   * fact that is NOT recoverable from the database, and everything else - the
   * declared recipe, its order, each step's declaration digest - is resolved
   * here so that no call site can compute a step identity differently.
   */
  ranStepSlugs?: string[] | null;
  /**
   * The caller knows the recipe but genuinely cannot say what happened to each
   * step - the settlement reconciler recreating a row whose output was lost
   * with the process is the case this exists for.
   *
   * Every declared step is then `unresolved`, which is the honest answer.
   * Passing an empty `ranStepSlugs` instead would mark them all `skipped`, and
   * `skipped` is a positive claim that the step never executed - here it very
   * probably did.
   */
  stepsUnknown?: boolean;
}

interface TxnRow {
  id: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  provenance: unknown;
  transparency_marker: string | null;
  receipt_status: string | null;
  capability_id: string | null;
  solution_slug: string | null;
  [k: string]: unknown;
}

function asMethod(marker: string | null): ExecutionMethod {
  return (EXECUTION_METHODS as readonly string[]).includes(marker ?? "")
    ? (marker as ExecutionMethod)
    : "algorithmic";
}

/**
 * What the receipt says about data vintage.
 *
 * Deliberately conservative. `none_declared` says "we do not know"; `computed`
 * positively asserts there was no external source. Guessing a dataset version
 * we never recorded would put a fabricated vintage inside a commitment, which
 * is worse than admitting the gap - Phase 2 expects `none_declared` to
 * dominate at the epoch and to shrink as capabilities declare properly.
 */
export function deriveSourceObservation(
  provenance: unknown,
  freshnessCategory: string | null,
): SourceObservation {
  const p = (provenance ?? {}) as Record<string, unknown>;
  const fetchedAt = typeof p.fetched_at === "string" ? p.fetched_at : null;
  if (fetchedAt) {
    const parsed = new Date(fetchedAt);
    if (!Number.isNaN(parsed.getTime())) {
      return { kind: "live_fetch", observed_at: parsed.toISOString() };
    }
  }
  if (freshnessCategory === "computed") return { kind: "computed" };
  return { kind: "none_declared" };
}

/**
 * The caller-visible error, as a closed shape.
 *
 * `transactions.error` is the sanitised message the caller already received -
 * the production sanitiser has already redacted URLs by the time it is stored
 * - so this binds what was served rather than an internal string.
 */
function toReceiptError(row: TxnRow): { code: string; message: string } | null {
  if (row.status !== "failed") return null;
  return { code: "execution_failed", message: row.error ?? "" };
}

/**
 * Build and persist the receipt for a settled transaction.
 *
 * Never throws. Never returns a value the caller has to check: the outcome
 * lives in `transactions.receipt_status`, which is the only place a verifier
 * will ever look.
 */
export async function settleExecutionReceipt(db: Db, params: SettleParams): Promise<void> {
  try {
    await settleOrThrow(db, params);
  } catch (err) {
    // Last resort. The row stays `pending` and the sweeper owns it from here,
    // so the failure is visible in the backlog counters rather than lost.
    log.warn(
      {
        label: "receipt-settle-failed",
        transaction_id: params.transactionId,
        rail: params.rail,
        err: err instanceof Error ? err.message : String(err),
      },
      "execution receipt could not be settled; left pending for the sweeper",
    );
  }
}

async function settleOrThrow(db: Db, params: SettleParams): Promise<void> {
  const rows = (await db.execute(sql`
    SELECT t.id, t.status, t.input, t.output, t.error, t.provenance,
           t.transparency_marker, t.receipt_status, t.capability_id, t.solution_slug,
           c.slug              AS c_slug,
           c.name              AS c_name,
           c.input_schema      AS c_input_schema,
           c.output_schema     AS c_output_schema,
           c.transparency_tag  AS c_transparency_tag,
           c.data_source       AS c_data_source,
           c.capability_type   AS c_capability_type,
           c.freshness_category AS c_freshness_category,
           c.output_field_reliability AS c_output_field_reliability,
           c.processes_personal_data  AS c_processes_personal_data,
           c.personal_data_categories AS c_personal_data_categories,
           c.gdpr_art_22_classification AS c_gdpr,
           c.data_update_cycle_days   AS c_cycle_days,
           c.dataset_last_updated     AS c_dataset_last_updated,
           c.data_classification      AS c_data_classification,
           c.x402_method              AS c_x402_method
      FROM transactions t
      LEFT JOIN capabilities c ON c.id = t.capability_id
     WHERE t.id = ${params.transactionId}::uuid
  `)) as unknown as TxnRow[];

  const row = rows[0];
  if (!row) return; // nothing to settle; the row was pruned or never existed

  // Only a settled row can be committed to. An `executing` or `deferred` row
  // has no final result yet, and the async path settles later.
  if (row.status !== "completed" && row.status !== "failed") return;

  // Someone already terminalised this receipt. markReceiptComplete is guarded
  // on `pending` anyway, but returning early keeps a duplicate call from
  // writing a snapshot for nothing.
  if (row.receipt_status === "complete" || row.receipt_status === "failed") return;

  const isSolution = Boolean(params.solutionSlug ?? row.solution_slug);
  const subjectSlug = isSolution
    ? String(params.solutionSlug ?? row.solution_slug ?? "")
    : String(row.c_slug ?? "");

  // -- Manifest snapshot ---------------------------------------------------
  let manifestDigest: string | null = null;
  let solutionSteps: SolutionStepIdentity[] = [];
  try {
    if (isSolution) {
      solutionSteps = await resolveSolutionSteps(db, subjectSlug, params.ranStepSlugs ?? [], {
        stepsUnknown: params.stepsUnknown === true,
      });
      if (solutionSteps.length === 0) {
        // A solution with no declared steps cannot be committed to: there is
        // no recipe to bind. Recorded as an invariant failure rather than as
        // an empty step list, which would hash to a real digest that means
        // nothing.
        await markReceiptFailed(db, row.id, "unresolvable_manifest");
        return;
      }
      manifestDigest = await recordManifestSnapshot(
        db,
        normalizeSolutionDeclaration({ slug: subjectSlug, steps: solutionSteps }),
      );
    } else {
      if (!row.capability_id || !row.c_slug) {
        await markReceiptFailed(db, row.id, "unresolvable_manifest");
        return;
      }
      manifestDigest = await recordManifestSnapshot(
        db,
        normalizeCapabilityDeclaration({
          slug: String(row.c_slug),
          name: (row.c_name as string | null) ?? null,
          inputSchema: row.c_input_schema ?? null,
          outputSchema: row.c_output_schema ?? null,
          transparencyTag: (row.c_transparency_tag as string | null) ?? null,
          dataSource: (row.c_data_source as string | null) ?? null,
          capabilityType: (row.c_capability_type as string | null) ?? null,
          freshnessCategory: (row.c_freshness_category as string | null) ?? null,
          outputFieldReliability: row.c_output_field_reliability ?? null,
          processesPersonalData: Boolean(row.c_processes_personal_data),
          personalDataCategories: (row.c_personal_data_categories as string[] | null) ?? null,
          gdprArt22Classification: (row.c_gdpr as string | null) ?? null,
          dataUpdateCycleDays: (row.c_cycle_days as number | null) ?? null,
          datasetLastUpdated: row.c_dataset_last_updated
            ? new Date(row.c_dataset_last_updated as string)
            : null,
          dataClassification: (row.c_data_classification as string | null) ?? null,
          x402Method: (row.c_x402_method as string | null) ?? null,
        }),
      );
    }
  } catch (err) {
    log.warn(
      { label: "receipt-snapshot-failed", transaction_id: row.id, err: String(err) },
      "manifest snapshot write failed",
    );
    await markReceiptFailed(db, row.id, "snapshot_write_failed");
    return;
  }

  // -- Deploy identity -----------------------------------------------------
  // In production this cannot fail, because the boot gate already asserted it
  // and the process would not be serving otherwise. Handled anyway rather than
  // assumed, because "cannot happen" is how the Phase 4 review found six of
  // its findings.
  let deployCommit: string;
  try {
    deployCommit = resolveDeployCommit();
  } catch {
    await markReceiptFailed(db, row.id, "missing_deploy_identity");
    return;
  }

  const input: ReceiptInput = {
    transactionId: row.id,
    subjectKind: isSolution ? "solution" : "capability",
    subjectSlug,
    deployCommit,
    manifestDigest,
    steps: isSolution ? solutionSteps : null,
    rail: params.rail,
    inputs: row.input ?? null,
    status: row.status === "completed" ? "completed" : "failed",
    // Exactly the bytes the caller received: `/v1/do` returns this column as
    // `result.output`, and `/v1/transactions/:id` serves the same value.
    result: row.status === "completed" ? (row.output ?? null) : null,
    error: toReceiptError(row),
    method: asMethod(row.transparency_marker),
    sourceObservation: deriveSourceObservation(
      row.provenance,
      (row.c_freshness_category as string | null) ?? null,
    ),
  };

  const built = buildExecutionReceipt(input);
  if (built.outcome !== "complete") {
    await markReceiptFailed(db, row.id, built.reason);
    return;
  }
  await markReceiptComplete(db, row.id, built);
}


/**
 * The ordered step identities for a solution, resolved from the declared
 * recipe plus the one fact only the caller knows: which steps produced output.
 *
 * ## Why the order is re-indexed
 *
 * `solution_steps.step_order` is the authoring column, and it is not
 * constrained to the shape a receipt needs - parallel groups share an order,
 * and nothing forbids gaps or a zero. `normalizeSolutionDeclaration` requires
 * strictly increasing positive integers precisely because anything looser has
 * more than one reading. So the declared rows are sorted by
 * `(step_order, capability_slug)` - the slug breaking ties deterministically,
 * which is what makes a parallel group hash the same way every time - and then
 * numbered 1..N. The numbering is derived from the recipe, never from the
 * order a caller happened to pass.
 *
 * ## Dispositions
 *
 * `ran` when the caller received that step's output. Otherwise `skipped`: the
 * step never executed, whether because a gate short-circuited the bundle or
 * because an earlier step's failure stopped it. `unresolved` is reserved for
 * the genuinely different case where a step SHOULD have run and its
 * declaration could not be read - which is why a step whose capability row has
 * gone missing is marked `unresolved` here rather than quietly dropped.
 */
export async function resolveSolutionSteps(
  db: Db,
  solutionSlug: string,
  ranStepSlugs: string[],
  opts: { stepsUnknown?: boolean } = {},
): Promise<SolutionStepIdentity[]> {
  const rows = (await db.execute(sql`
    SELECT ss.step_order, ss.capability_slug,
           c.id                AS c_id,
           c.slug              AS c_slug,
           c.name              AS c_name,
           c.input_schema      AS c_input_schema,
           c.output_schema     AS c_output_schema,
           c.transparency_tag  AS c_transparency_tag,
           c.data_source       AS c_data_source,
           c.capability_type   AS c_capability_type,
           c.freshness_category AS c_freshness_category,
           c.output_field_reliability AS c_output_field_reliability,
           c.processes_personal_data  AS c_processes_personal_data,
           c.personal_data_categories AS c_personal_data_categories,
           c.gdpr_art_22_classification AS c_gdpr,
           c.data_update_cycle_days   AS c_cycle_days,
           c.dataset_last_updated     AS c_dataset_last_updated,
           c.data_classification      AS c_data_classification,
           c.x402_method              AS c_x402_method
      FROM solution_steps ss
      JOIN solutions s ON s.id = ss.solution_id
      LEFT JOIN capabilities c ON c.slug = ss.capability_slug
     WHERE s.slug = ${solutionSlug}
     ORDER BY ss.step_order ASC, ss.capability_slug ASC
  `)) as unknown as Array<Record<string, unknown>>;

  const ran = new Set(ranStepSlugs);
  const out: SolutionStepIdentity[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const slug = String(r.capability_slug);
    const didRun = ran.has(slug);

    if (opts.stepsUnknown) {
      out.push({ step_order: i + 1, slug, disposition: "unresolved", manifest_digest: null });
      continue;
    }

    if (!r.c_slug) {
      // Declared in the recipe, but the capability row is gone. This is the
      // case `unresolved` exists for: something should have run and we cannot
      // say what it was.
      out.push({ step_order: i + 1, slug, disposition: "unresolved", manifest_digest: null });
      continue;
    }

    if (!didRun) {
      out.push({ step_order: i + 1, slug, disposition: "skipped", manifest_digest: null });
      continue;
    }

    const digest = await recordManifestSnapshot(
      db,
      normalizeCapabilityDeclaration({
        slug: String(r.c_slug),
        name: (r.c_name as string | null) ?? null,
        inputSchema: r.c_input_schema ?? null,
        outputSchema: r.c_output_schema ?? null,
        transparencyTag: (r.c_transparency_tag as string | null) ?? null,
        dataSource: (r.c_data_source as string | null) ?? null,
        capabilityType: (r.c_capability_type as string | null) ?? null,
        freshnessCategory: (r.c_freshness_category as string | null) ?? null,
        outputFieldReliability: r.c_output_field_reliability ?? null,
        processesPersonalData: Boolean(r.c_processes_personal_data),
        personalDataCategories: (r.c_personal_data_categories as string[] | null) ?? null,
        gdprArt22Classification: (r.c_gdpr as string | null) ?? null,
        dataUpdateCycleDays: (r.c_cycle_days as number | null) ?? null,
        datasetLastUpdated: r.c_dataset_last_updated
          ? new Date(r.c_dataset_last_updated as string)
          : null,
        dataClassification: (r.c_data_classification as string | null) ?? null,
        x402Method: (r.c_x402_method as string | null) ?? null,
      }),
    );
    out.push({ step_order: i + 1, slug, disposition: "ran", manifest_digest: digest });
  }

  return out;
}
