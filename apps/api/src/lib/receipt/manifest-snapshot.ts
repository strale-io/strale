/**
 * The manifest snapshot authority (Phase 4 §A).
 *
 * One place decides what "the declaration in force at execution time" means,
 * and one place writes it down.
 *
 * ## Why a snapshot at all
 *
 * The executor reads `capabilities`, a MUTABLE row that four scripts write to.
 * Deriving implementation identity from it later would prove what the
 * declaration says *today*, not what it said when the call ran. A receipt
 * assembled that way asserts something nobody measured — which is exactly the
 * failure Phase 2 decision 2 names.
 *
 * So the declaration is normalized and stored, content-addressed, at execution
 * time. The digest is the identity; the row is the content; neither can move
 * (migration 0106 refuses UPDATE and DELETE at the database).
 *
 * ## What goes in, and the rule behind it
 *
 * **If changing the field changes what a correct execution would produce, or
 * how its result must be interpreted, it is IN. If it changes only how the
 * capability is sold, listed, or measured, it is OUT.**
 *
 * That rule is the whole of the judgement. Applying it:
 *
 *  IN  — slug, input/output schema, transparency tag, data source,
 *        capability type, freshness category, output field reliability,
 *        personal-data classification, GDPR Art. 22 classification.
 *  OUT — is_active, x402_enabled, visible, lifecycle_state (routing and
 *        eligibility, not declaration; they change constantly without changing
 *        what runs), price_cents (commercial — already bound by the chain, and
 *        binding it here would force disclosing terms to verify a result),
 *        avg_latency_ms and quality scores (observational, not declared),
 *        limitations and descriptions (disclosure prose; changing a sentence
 *        must not invalidate a result's identity).
 *
 * One naming note, because the spec and the database disagree: the manifest
 * field is `data_source_type`, but the column actually in force is
 * `capability_type` — the value the executor's behaviour depends on. The
 * snapshot records the column, under its own name, so what is hashed is what
 * was true rather than what the YAML said.
 */

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { canonicalize } from "../canonical/jcs.js";
import { DOMAIN_TAGS, domainDigest } from "../canonical/domain-digest.js";

export type SubjectKind = "capability" | "solution";

/** Thrown when a snapshot cannot be built or stored. Never swallowed. */
export class ManifestSnapshotError extends Error {
  readonly reason: "unresolvable_manifest" | "snapshot_write_failed";
  constructor(reason: ManifestSnapshotError["reason"], detail: string) {
    super(`${reason}: ${detail}`);
    this.name = "ManifestSnapshotError";
    this.reason = reason;
  }
}

/**
 * The capability columns that constitute the declaration.
 *
 * Listed explicitly rather than spread from the row, so adding a column to
 * `capabilities` cannot silently change every future digest.
 */
export interface CapabilityDeclarationSource {
  slug: string;
  inputSchema: unknown;
  outputSchema: unknown;
  transparencyTag: string | null;
  dataSource: string | null;
  capabilityType: string | null;
  freshnessCategory: string | null;
  outputFieldReliability: unknown;
  processesPersonalData: boolean;
  personalDataCategories: string[] | null;
  gdprArt22Classification: string | null;
  /**
   * The freshness pair. Phase 4 excluded these as "metadata"; that was wrong,
   * and the correction is derived from execution semantics rather than
   * convenience.
   *
   * They are the inputs to the trust grade (`lib/trust-grade.ts`), and
   * `POST /v1/do` REFUSES a reference-data request outright when
   * `require_fresh` is set and the computed grade is C (`routes/do.ts`). So
   * these two columns decide whether a request is served or rejected. Two
   * executions of the same slug, one served and one refused, would otherwise
   * carry byte-identical implementation identity — which is exactly the
   * under-specification a receipt exists to prevent.
   */
  dataUpdateCycleDays: number | null;
  datasetLastUpdated: Date | null;
  /**
   * Not a display label, despite the name.
   *
   * `routes/do.ts` writes `data_source: capability.dataSource ?? capability.name`
   * into the audit body at three sites, and `x402-gateway-v2.ts` does the same
   * with the slug. So for any capability with a null `data_source` — and there
   * are such rows — `name` IS the recorded provenance source. Renaming one
   * changes what the audit trail says produced the answer, which makes it
   * execution-relevant by the same test as the pair above.
   */
  name: string | null;
  /**
   * Written into the audit body as `data_classification` at three sites in
   * `routes/do.ts`. Same test as `name`: it changes what we recorded about the
   * execution, so it is bound.
   */
  dataClassification: string | null;
  /**
   * The HTTP method the x402 rail exposes, and part of the challenge and
   * schema it publishes (`x402-gateway-v2.ts`). It shapes how the request is
   * made, so two capabilities differing only here are not interchangeable.
   */
  x402Method: string | null;
}

/**
 * What happened to a step.
 *
 * A null `manifest_digest` used to mean BOTH "a gate skipped it" and "we could
 * not read its declaration" — two materially different facts producing an
 * identical digest, so a receipt had two readings. PHASE-2-SPEC §5 requires the
 * absence to be *recorded*, not merely implied. Reviewer-found.
 */
export const STEP_DISPOSITIONS = ["ran", "skipped", "unresolved"] as const;
export type StepDisposition = (typeof STEP_DISPOSITIONS)[number];

/** One step of a solution, in execution order. */
export interface SolutionStepIdentity {
  /** 1-based, strictly increasing across the array. Enforced, not assumed. */
  step_order: number;
  slug: string;
  /**
   * `ran` — executed, and `manifest_digest` is its declaration.
   * `skipped` — a gate short-circuited it; it never ran, deliberately.
   * `unresolved` — it should have run but its declaration could not be read.
   */
  disposition: StepDisposition;
  /** The step's declaration digest. Non-null exactly when disposition is `ran`. */
  manifest_digest: string | null;
}

export interface SolutionDeclarationSource {
  slug: string;
  steps: SolutionStepIdentity[];
}

/**
 * The normalized capability declaration. Key order is irrelevant — RFC 8785
 * sorts — but the SET is fixed, and every member is always present.
 */
export function normalizeCapabilityDeclaration(
  source: CapabilityDeclarationSource,
): Record<string, unknown> {
  return {
    subject_kind: "capability",
    slug: source.slug,
    input_schema: source.inputSchema ?? null,
    output_schema: source.outputSchema ?? null,
    transparency_tag: source.transparencyTag ?? null,
    data_source: source.dataSource ?? null,
    capability_type: source.capabilityType ?? null,
    freshness_category: source.freshnessCategory ?? null,
    output_field_reliability: source.outputFieldReliability ?? null,
    processes_personal_data: source.processesPersonalData,
    personal_data_categories: [...(source.personalDataCategories ?? [])].sort(),
    gdpr_art_22_classification: source.gdprArt22Classification ?? null,
    name: source.name ?? null,
    data_classification: source.dataClassification ?? null,
    x402_method: source.x402Method ?? null,
    data_update_cycle_days: source.dataUpdateCycleDays ?? null,
    // A Date is not canonicalizable and two Dates one millisecond apart are a
    // different declaration, so this is pinned to its UTC ISO form here rather
    // than left to whatever the caller happens to pass.
    dataset_last_updated: source.datasetLastUpdated
      ? source.datasetLastUpdated.toISOString()
      : null,
  };
}

/**
 * Every column of `capabilities`, classified: does it enter the declaration
 * digest, or not, and why not?
 *
 * This exists because `CapabilityDeclarationSource` is hand-maintained. Listing
 * the fields explicitly stops a NEW column from silently changing every future
 * digest — but it has the mirror-image failure, which is what this map closes:
 * a new execution-relevant column silently NEVER entering the digest, so two
 * materially different implementations share one identity. Nothing would fail;
 * the receipts would just quietly mean less.
 *
 * The parity test in `manifest-declaration-parity.test.ts` fails when a column
 * appears in the schema and not here, so the choice has to be made by a person
 * once, in the open, rather than defaulted to "excluded" by inaction.
 */
export const CAPABILITY_COLUMN_DISPOSITION: Record<string, "declaration" | string> = {
  // ---------------------------------------------------------------- included
  slug: "declaration",
  name: "declaration",
  input_schema: "declaration",
  output_schema: "declaration",
  transparency_tag: "declaration",
  data_source: "declaration",
  capability_type: "declaration",
  freshness_category: "declaration",
  output_field_reliability: "declaration",
  processes_personal_data: "declaration",
  personal_data_categories: "declaration",
  gdpr_art_22_classification: "declaration",
  data_update_cycle_days: "declaration",
  dataset_last_updated: "declaration",
  data_classification: "declaration",
  x402_method: "declaration",

  // ---------------------------------------------------------------- excluded
  //
  // Three tests separate these from the list above, and only the first two
  // admit a column:
  //   1. does it change what the execution COMPUTED?
  //   2. does it change what we RECORDED about the execution?
  //   3. does it merely decide whether the execution was allowed to happen?
  // (3) is admission control. It is excluded on purpose: a refusal is not an
  // execution, and when a request IS served the column had no bearing on the
  // answer. The rail — which is what admission is usually keyed on — is
  // already a fixed-point member of the receipt.

  id: "surrogate key; slug is the identity a reader can act on",
  created_at: "row bookkeeping",
  updated_at: "row bookkeeping, and it churns on every metadata write",
  description: "prose for humans and SEO; never read on the execution path",
  category: "catalog taxonomy; routing reads the slug",
  search_tags: "discovery only",
  visible: "catalog display",
  geography: "where the data is ABOUT, a property of the dataset. Deliberately NOT the processing jurisdiction -- F-AUDIT-01 removed it from that use (see x402-gateway-v2.ts) -- and the jurisdiction actually applied is recorded per-execution on the transaction row",

  price_cents: "commercial term; the transaction row records what was charged",
  is_free_tier: "commercial term; likewise recorded per-execution",

  is_active: "admission control (3)",
  lifecycle_state: "admission control (3)",
  x402_enabled: "admission control (3), and the rail is already bound",
  cost_class: "admission control (3): ALLOW_MATRIX in guarded-executor.ts refuses invocation from some context kinds. It gates whether a call is permitted, and changes nothing about the answer when it is",
  quota_window: "admission control (3), vendor budget",
  quota_cap: "admission control (3), vendor budget",
  quota_reset_dom: "admission control (3), vendor budget",
  marketplace_eligible: "admission control (3), listing",
  marketplace_eligible_reason: "operator note attached to the line above",
  maintenance_class: "operational scheduling; read by the test generators, not by execution",

  avg_latency_ms: "observed statistic, not a declaration. It does select sync vs async routing, but the receipt records the execution mode it actually took, so the fact is bound directly rather than by proxy",
  success_rate: "observed statistic",
  last_tested_at: "observed statistic",
  degraded_recovery_count: "observed statistic",
  deactivation_reason: "operator note",
  onboarding_hook_failures: "operational counter",
  onboarding_manifest: "the AUTHORING artifact. The columns in force are what execution reads, and binding both would let a receipt claim a declaration that never took effect",

  error_codes_json:
    "documentation of the errors a capability MAY return. The error actually returned is bound by the receipt's own result",
  freshness_level:
    "derived label. The trust grade is computed from freshness_category plus the data_update_cycle_days / dataset_last_updated pair, all three of which are bound",
  freshness_decayed_at: "derived timestamp of the same computation",

  fallback_capability_slug: "trust-DISPLAY data for the capability detail page, not routing: no execution-path file reads it. If it ever becomes routing, it moves to declaration -- and this guard is what will force that decision",
  fallback_coverage: "trust-display data, as above",
  fallback_verification_level: "trust-display data, as above",

  // Residue of the SQS engine deleted under DEC-20260503-B (2026-05-05). PR2
  // drops the columns; nothing reads them now.
  qp_score: "dead SQS column",
  rp_score: "dead SQS column",
  matrix_sqs: "dead SQS column",
  matrix_sqs_raw: "dead SQS column",
  trend: "dead SQS column",
  guidance_usable: "dead SQS column",
  guidance_strategy: "dead SQS column",
  guidance_confidence: "dead SQS column",
};

/**
 * The normalized solution declaration.
 *
 * Binds the recipe AND every ingredient: the ordered step list with each
 * step's own manifest digest. Without the per-step digests, swapping a
 * constituent capability's implementation would change what ran while leaving
 * the solution receipt identical — the under-specification Phase 2 §5 names.
 *
 * Order is part of the identity: the same steps in a different order are a
 * different computation.
 */
export function normalizeSolutionDeclaration(
  source: SolutionDeclarationSource,
): Record<string, unknown> {
  assertWellFormedSteps(source.slug, source.steps);
  return {
    subject_kind: "solution",
    slug: source.slug,
    steps: [...source.steps]
      .sort((a, b) => a.step_order - b.step_order)
      .map((step) => ({
        step_order: step.step_order,
        slug: step.slug,
        disposition: step.disposition,
        manifest_digest: step.manifest_digest,
      })),
  };
}

/**
 * A solution's step list must have exactly one reading.
 *
 * `Array.prototype.sort` is stable, so with duplicate `step_order` values the
 * CALLER'S array order silently becomes load-bearing: `[{1,x},{1,y}]` and
 * `[{1,y},{1,x}]` declare the same ordering and produce different digests.
 * Reviewer-found, along with `-3`, `0` and `2.5` all being accepted as orders,
 * and an empty step list being accepted for a solution.
 *
 * Strictly increasing positive integers is the only shape with one reading.
 */
export function assertWellFormedSteps(
  solutionSlug: string,
  steps: readonly SolutionStepIdentity[],
): void {
  if (steps.length === 0) {
    throw new ManifestSnapshotError(
      "unresolvable_manifest",
      `solution ${solutionSlug} has no steps; a solution is its steps`,
    );
  }

  const orders = steps.map((s) => s.step_order);
  for (const o of orders) {
    if (!Number.isInteger(o) || o < 1) {
      throw new ManifestSnapshotError(
        "unresolvable_manifest",
        `solution ${solutionSlug} has step_order ${o}; must be a positive integer`,
      );
    }
  }
  const sorted = [...orders].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) {
      throw new ManifestSnapshotError(
        "unresolvable_manifest",
        `solution ${solutionSlug} repeats step_order ${sorted[i]}; ordering would be ` +
          "decided by array position, which is not part of the declared identity",
      );
    }
  }

  for (const step of steps) {
    const wantsDigest = step.disposition === "ran";
    if (wantsDigest && !step.manifest_digest) {
      throw new ManifestSnapshotError(
        "unresolvable_manifest",
        `solution ${solutionSlug} step ${step.slug} ran but carries no manifest digest`,
      );
    }
    if (!wantsDigest && step.manifest_digest) {
      throw new ManifestSnapshotError(
        "unresolvable_manifest",
        `solution ${solutionSlug} step ${step.slug} is ${step.disposition} but carries ` +
          "a manifest digest; only a step that ran has one",
      );
    }
  }
}

/** The digest of a normalized declaration. Pure — no database. */
export function declarationDigest(normalized: Record<string, unknown>): string {
  return domainDigest(DOMAIN_TAGS.manifestSnapshot, normalized);
}

/** The exact bytes the digest was taken over, for out-of-band recomputation. */
export function declarationCanonicalBytes(normalized: Record<string, unknown>): string {
  return canonicalize(normalized);
}

/**
 * Store a normalized declaration, returning its digest.
 *
 * Deduplicates by digest: identical declarations converge on one row, so the
 * table grows only when a declaration actually changes. `ON CONFLICT DO
 * NOTHING` is the whole dedup mechanism — the digest being the primary key is
 * what makes it correct rather than merely convenient.
 *
 * Failure is an `unresolvable_manifest`/`snapshot_write_failed` refusal, never
 * a silently-absent digest: a receipt without implementation identity is not a
 * receipt.
 */
export async function recordManifestSnapshot(
  db: PostgresJsDatabase<Record<string, never>> | PostgresJsDatabase<any>,
  normalized: Record<string, unknown>,
): Promise<string> {
  const kind = normalized.subject_kind;
  const slug = normalized.slug;
  if (kind !== "capability" && kind !== "solution") {
    throw new ManifestSnapshotError(
      "unresolvable_manifest",
      `subject_kind must be 'capability' or 'solution', got ${JSON.stringify(kind)}`,
    );
  }
  if (typeof slug !== "string" || slug.length === 0) {
    throw new ManifestSnapshotError("unresolvable_manifest", "slug is missing or empty");
  }

  let digest: string;
  try {
    digest = declarationDigest(normalized);
  } catch (err) {
    // A declaration that cannot be canonicalized cannot be committed to.
    throw new ManifestSnapshotError(
      "unresolvable_manifest",
      `declaration is not canonicalizable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    const inserted = await db.execute(sql`
      INSERT INTO execution_manifest_snapshots (digest, subject_kind, subject_slug, snapshot)
      VALUES (${digest}, ${kind}, ${slug}, ${JSON.stringify(normalized)}::jsonb)
      ON CONFLICT (digest) DO NOTHING
      RETURNING digest
    `);

    // ON CONFLICT DO NOTHING is silent by design, which is what makes dedup
    // work — and what would also silently discard a DIFFERENT snapshot that
    // happened to arrive under the same digest. That should be impossible
    // (the digest is a function of the content) but "should be impossible" is
    // exactly what a content-addressed table has to check rather than assume.
    if ((inserted as unknown as Array<unknown>).length === 0) {
      const stored = await readManifestSnapshot(db, digest); // recomputes
      if (stored === null || canonicalize(stored) !== canonicalize(normalized)) {
        throw new ManifestSnapshotError(
          "snapshot_write_failed",
          `digest ${digest} already stores different content; refusing to report ` +
            "success for a snapshot that was not written",
        );
      }
    }
  } catch (err) {
    if (err instanceof ManifestSnapshotError) throw err;
    throw new ManifestSnapshotError(
      "snapshot_write_failed",
      err instanceof Error ? err.message : String(err),
    );
  }

  return digest;
}

/**
 * Read a snapshot back. This is what makes a receipt independently
 * recomputable years later — without it, `manifest_digest` is an opaque string.
 */
export async function readManifestSnapshot(
  db: PostgresJsDatabase<Record<string, never>> | PostgresJsDatabase<any>,
  digest: string,
): Promise<Record<string, unknown> | null> {
  const rows = await db.execute(sql`
    SELECT snapshot FROM execution_manifest_snapshots WHERE digest = ${digest}
  `);
  const row = (rows as unknown as Array<{ snapshot: Record<string, unknown> }>)[0];
  if (!row) return null;

  // RECOMPUTE BEFORE TRUSTING.
  //
  // "Content-addressed" was an assertion, not an enforcement: a direct INSERT
  // bypassing this module could pair digest A with snapshot B, and it was
  // accepted. The reviewer did exactly that. The digest-to-content relation
  // cannot be a database CHECK — Postgres has no RFC 8785 — so the one reader a
  // verifier depends on is where it has to be checked.
  //
  // A mismatch is not a data-quality nit. It means the table's addressing is
  // broken, and every receipt naming this digest is unverifiable.
  const actual = declarationDigest(row.snapshot);
  if (actual !== digest) {
    throw new ManifestSnapshotError(
      "unresolvable_manifest",
      `snapshot stored under ${digest} actually hashes to ${actual}; the table is ` +
        "mis-addressed and every receipt naming this digest is unverifiable",
    );
  }
  return row.snapshot;
}
