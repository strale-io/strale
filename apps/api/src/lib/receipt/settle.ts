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
import { sanitizeFailureReason } from "../sanitize.js";

type Db = ReturnType<typeof getDb>;

/** Rails that create a customer-visible transaction. Closed, per Phase 2. */
export type SettleRail = "v1_do" | "x402" | "mcp" | "a2a" | "internal";

export interface SettleParams {
  transactionId: string;
  /**
   * The rail, as the calling site knows it.
   *
   * Optional because the authoritative copy is `transactions.receipt_rail`,
   * captured at INSERT (block 0110). When both are present they are
   * cross-checked and a disagreement is logged - two derivations of one fact
   * is exactly the shape that drifts, so it is better to notice.
   */
  rail?: SettleRail;
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
  receipt_rail: string | null;
  receipt_deploy_commit: string | null;
  redacted_at: unknown;
  deleted_at: unknown;
  [k: string]: unknown;
}

/**
 * The EU AI Act transparency marker, as one of the receipt's three methods.
 *
 * ## Why a fallback to `algorithmic` was the wrong shape
 *
 * The previous version returned `algorithmic` for anything outside the closed
 * set, and three production sources land outside it - so the receipt asserted
 * "no model was involved" for executions that declare one:
 *
 *  1. `routes/do.ts` maps a `mixed` capability to the marker `hybrid`, which
 *     is not a member. `lib/audit-helpers.ts` has always treated `hybrid` and
 *     `mixed` as the same thing; only this enum disagreed.
 *  2. `lib/test-runner.ts` hardcoded `algorithmic` for every internal-harness
 *     row - 99.3% of platform traffic - including AI capabilities. Fixed at
 *     the source in that file; the declaration fallback below also covers it.
 *  3. `jobs/settlement-reconciler.ts` writes `unknown`, with a comment
 *     explaining that inheriting a marker would be "a fabricated EU AI Act
 *     Art. 50 marker on a call we cannot describe" - and the fallback then
 *     fabricated one anyway, one file over.
 *
 * Measured by the reviewer against 30 days of production: 8,010 of ~193,600
 * rows (4.1%) would have carried a receipt claiming no model was involved.
 *
 * Note the asymmetry that made this easy to miss: an unmapped RAIL is a
 * refusal, because "a permissive fallback is how the wrong rail gets
 * asserted". An unmapped METHOD had a permissive fallback to the least
 * disclosive value. Both are now refusals.
 *
 * Returns null when the method cannot be established, and the caller records
 * an invariant failure rather than guessing.
 */
export function asMethod(
  marker: string | null,
  declaredTag: string | null,
): ExecutionMethod | null {
  for (const candidate of [marker, declaredTag]) {
    if (!candidate) continue;
    // `hybrid` is the marker spelling of `mixed`. Not a fallback: the same
    // fact under the name routes/do.ts writes.
    const normalized = candidate === "hybrid" ? "mixed" : candidate;
    if ((EXECUTION_METHODS as readonly string[]).includes(normalized)) {
      return normalized as ExecutionMethod;
    }
  }
  return null;
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
 * ## Why this sanitises rather than trusting the column
 *
 * The previous version of this function bound `row.error` directly, and its
 * comment asserted as fact that "the production sanitiser has already redacted
 * URLs by the time it is stored". That is true on two rails and false on a
 * third, which is the worst possible distribution for an assumption.
 *
 * `solution-execute.ts` and `x402-gateway-v2.ts` store
 * `sanitizeFailureReason(...)`. The `/v1/do` capability rails store the RAW
 * `err.message` and sanitise only on the way out, at `routes/do.ts` :1778,
 * :1968 and :2344. So on those rails the receipt committed to a string the
 * caller never saw - and a party holding the request and the response could
 * not recompute the digest, which is the single thing this system exists to
 * make possible.
 *
 * Reviewer-found, and measured against production rather than argued: over
 * seven days, 5,016 of 33,952 failed rows (14.8%) have a raw message that
 * differs from its sanitised form. `fetch failed` becomes "External service
 * temporarily unavailable"; anything carrying a URL or hostname becomes
 * `[service]`; every ENOTFOUND/ETIMEDOUT becomes "Service temporarily
 * unreachable".
 *
 * Sanitising HERE rather than changing what the rails store keeps raw
 * diagnostics in the column where operators expect them, and makes the
 * receipt's own contract - `ReceiptInput.error` says "the sanitised,
 * caller-visible error" - hold on every rail that has ever produced a failure
 * in production. `sanitizeFailureReason` is idempotent over the real corpus
 * (541 distinct production messages, zero non-idempotent), so applying it to
 * an already-sanitised message is a no-op.
 *
 * ## Three paths where it still does not hold, and why they are not fixed here
 *
 * A second reviewer found three failure branches that store one string and
 * serve another shape entirely, so the receipt cannot match what the caller
 * saw:
 *
 *  - `do.ts` x402 settlement-failed: stores "Payment settlement failed: ...",
 *    serves `{error_code: "payment_failed"}` - a different CODE, not just a
 *    different message.
 *  - `x402-gateway-v2.ts` solution-unbillable: serves the stored message
 *    WRAPPED in additional prose.
 *  - `solution-execute.ts` no-steps-configured: the response carries no
 *    `details.error` at all.
 *
 * All three have **zero occurrences in production history**, and each needs a
 * different structural change to the route rather than to this function, so
 * they are recorded as residual risk rather than papered over with a broader
 * claim here.
 */
function toReceiptError(row: TxnRow): { code: string; message: string } | null {
  if (row.status !== "failed") return null;
  return { code: "execution_failed", message: sanitizeFailureReason(row.error) };
}

/**
 * Build and persist the receipt for a settled transaction.
 *
 * Never throws. Never returns a value the caller has to check: the outcome
 * lives in `transactions.receipt_status`, which is the only place a verifier
 * will ever look.
 */
/**
 * How long the request path will wait for a receipt before handing it to the
 * sweeper.
 *
 * PHASE-2-SPEC section 9.1 says the money path must never wait on receipt
 * construction. Awaiting it after the transaction commits cannot endanger a
 * payment - that property is structural - but a hung database WOULD hold open
 * the response to a call that has already executed and been charged. A bound
 * makes the spec's sentence true in the way that matters: the wait is short
 * and finite, and exceeding it costs a few minutes of receipt latency rather
 * than a customer's request.
 */
export const SETTLE_DEADLINE_MS = 5_000;

export async function settleExecutionReceipt(db: Db, params: SettleParams): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      settleOrThrow(db, params),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`receipt settle exceeded ${SETTLE_DEADLINE_MS}ms`)),
          SETTLE_DEADLINE_MS,
        );
      }),
    ]);
  } catch (err) {
    // Last resort. The row stays `pending` and the sweeper owns it from here,
    // so the failure is visible in the backlog counters rather than lost.
    log.warn(
      {
        label: "receipt-settle-failed",
        transaction_id: params.transactionId,
        rail: params.rail ?? null,
        err: err instanceof Error ? err.message : String(err),
      },
      "execution receipt could not be settled; left pending for the sweeper",
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function settleOrThrow(db: Db, params: SettleParams): Promise<void> {
  const rows = (await db.execute(sql`
    SELECT t.id, t.status, t.input, t.output, t.error, t.provenance,
           t.transparency_marker, t.receipt_status, t.capability_id, t.solution_slug,
           t.receipt_rail, t.receipt_deploy_commit, t.redacted_at, t.deleted_at,
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

  // Content already erased. Narrow - retention runs at 90 days and settle runs
  // in milliseconds - but account closure can redact inside the async window,
  // and migration 0103's trigger nulls `output` when it does.
  //
  // Hashing then would produce a receipt that VERIFIES against a false claim:
  // "this completed execution returned null". A receipt that verifies against
  // something untrue is worse than no receipt, so this refuses instead.
  if (row.redacted_at != null || row.deleted_at != null) {
    log.warn(
      { label: "receipt-content-already-redacted", transaction_id: row.id },
      "content was erased before the receipt was built; refusing to commit to it",
    );
    await markReceiptFailed(db, row.id, "internal_error");
    return;
  }

  // Someone already terminalised this receipt. markReceiptComplete is guarded
  // on `pending` anyway, but returning early keeps a duplicate call from
  // writing a snapshot for nothing.
  if (row.receipt_status === "complete" || row.receipt_status === "failed") return;

  // The rail the ROW recorded wins. It was written at INSERT by the site that
  // created the transaction, which is the only moment the rail is known
  // exactly; a caller-supplied value is a second derivation of the same fact.
  const rowRail = row.receipt_rail as SettleRail | null;
  if (rowRail && params.rail && rowRail !== params.rail) {
    log.warn(
      {
        label: "receipt-rail-disagreement",
        transaction_id: row.id,
        row_rail: rowRail,
        param_rail: params.rail,
      },
      "the transaction row and the settling call site disagree about the rail",
    );
  }
  const rail = rowRail ?? params.rail ?? null;
  if (!rail) {
    // A site that writes a transaction and never records its rail. Phase 2's
    // closed reason set has exactly the right name for this, and it is loud.
    await markReceiptFailed(db, row.id, "unmapped_rail");
    return;
  }

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
  // Likewise the commit: the row's copy is the one that was SERVING when the
  // transaction was created. Reading the environment here instead would bind
  // whatever is running now, which for a sweeper retry after a deploy is a
  // different implementation than the one that produced the result - and the
  // digest would verify perfectly against the wrong answer.
  let deployCommit: string | null = (row.receipt_deploy_commit as string | null) ?? null;
  if (!deployCommit) {
    try {
      deployCommit = resolveDeployCommit();
    } catch {
      deployCommit = null;
    }
  }
  if (!deployCommit) {
    await markReceiptFailed(db, row.id, "missing_deploy_identity");
    return;
  }

  const method = asMethod(
    row.transparency_marker,
    (row.c_transparency_tag as string | null) ?? null,
  );
  if (!method) {
    // Neither the row's marker nor the capability's declaration names a method
    // we can commit to. Guessing here is how "no model was involved" gets
    // asserted about an execution that used one.
    log.warn(
      {
        label: "receipt-unresolvable-method",
        transaction_id: row.id,
        marker: row.transparency_marker,
        declared_tag: row.c_transparency_tag,
      },
      "execution method could not be established; receipt refused",
    );
    // TERMINAL, not `internal_error`.
    //
    // `internal_error` is in RETRYABLE_REASONS, and this condition is
    // deterministic - the row's marker and the capability's declared tag do
    // not change between attempts. Using it would burn five sweeper attempts,
    // hold the row out of the chain for half an hour, and put five entries in
    // a counter that receipt-lifecycle.ts deliberately reserves for real
    // signals ("retrying it would bury the escalation an operator is supposed
    // to act on"). Reviewer-found.
    //
    // `unresolvable_manifest` is the closest member of the closed set and it
    // is honest here: the declaration was read and does not establish a
    // required fixed-point member of the receipt.
    await markReceiptFailed(db, row.id, "unresolvable_manifest");
    return;
  }

  const input: ReceiptInput = {
    transactionId: row.id,
    subjectKind: isSolution ? "solution" : "capability",
    subjectSlug,
    deployCommit,
    manifestDigest,
    steps: isSolution ? solutionSteps : null,
    rail,
    inputs: row.input ?? null,
    status: row.status === "completed" ? "completed" : "failed",
    // Exactly the bytes the caller received: `/v1/do` returns this column as
    // `result.output`, and `/v1/transactions/:id` serves the same value.
    result: row.status === "completed" ? (row.output ?? null) : null,
    error: toReceiptError(row),
    method,
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
