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
  };
}

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
