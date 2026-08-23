/**
 * Parity between the `capabilities` schema and the declaration digest.
 *
 * `CapabilityDeclarationSource` is hand-maintained, and Phase 4 shipped it that
 * way deliberately: spreading the row would let a new column silently change
 * every future digest. But the hand-maintained list has the mirror-image
 * failure, and nothing guarded it — a new EXECUTION-RELEVANT column silently
 * never entering the digest, so two materially different implementations share
 * one identity. Nothing fails. The receipts just quietly mean less, which is the
 * worst failure mode a provenance system can have.
 *
 * Phase 4 listed this as residual risk 4 and said the repo already had the right
 * pattern in `capability-field-authority.test.ts`. This is that pattern.
 *
 * Note this file has to be a RUNTIME test rather than a type-level one:
 * `tsconfig.json` excludes every test file from compilation, so tsc never
 * sees test fixtures and cannot be the guard here.
 */

import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { capabilities } from "../../db/schema.js";
import {
  CAPABILITY_COLUMN_DISPOSITION,
  normalizeCapabilityDeclaration,
  type CapabilityDeclarationSource,
} from "./manifest-snapshot.js";

function dbColumnNames(table: Record<string, unknown>): string[] {
  const cols = getTableColumns(table as Parameters<typeof getTableColumns>[0]);
  return Object.values(cols).map((c) => (c as { name: string }).name);
}

/** Every field populated, so no key can be absent for want of a value. */
const FULL: CapabilityDeclarationSource = {
  slug: "vat-validate",
  name: "VAT Validate",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  transparencyTag: "algorithmic",
  dataSource: "VIES",
  capabilityType: "api",
  freshnessCategory: "live-fetch",
  outputFieldReliability: { valid: "guaranteed" },
  processesPersonalData: false,
  personalDataCategories: ["name"],
  gdprArt22Classification: "data_lookup",
  dataClassification: "public",
  x402Method: "POST",
  dataUpdateCycleDays: 30,
  datasetLastUpdated: new Date("2026-08-01T00:00:00.000Z"),
};

/** Present in the digest but not a column — synthesised by the normalizer. */
const SYNTHETIC = new Set(["subject_kind"]);

describe("capability declaration ↔ schema parity", () => {
  it("every capabilities column is classified", () => {
    const unclassified = dbColumnNames(capabilities).filter(
      (col) => !(col in CAPABILITY_COLUMN_DISPOSITION),
    );
    expect(
      unclassified,
      "New capabilities column(s) with no disposition. Decide, in " +
        "CAPABILITY_COLUMN_DISPOSITION: does this column change what an " +
        "execution DID? If so add it to CapabilityDeclarationSource and the " +
        "normalizer; if not, record the reason it cannot. Do not default to " +
        "excluded by inaction — that is the failure this guard exists for: " +
        unclassified.join(", "),
    ).toEqual([]);
  });

  it("every classified column still exists in the schema", () => {
    const cols = new Set(dbColumnNames(capabilities));
    const stale = Object.keys(CAPABILITY_COLUMN_DISPOSITION).filter((k) => !cols.has(k));
    expect(stale, `Disposition entries for columns that no longer exist: ${stale.join(", ")}`).toEqual(
      [],
    );
  });

  it("a column claiming to be in the declaration is actually in the digest", () => {
    // The half that matters. Without it the map is a comment: it could claim a
    // column is bound while the normalizer never reads it.
    const declared = Object.entries(CAPABILITY_COLUMN_DISPOSITION)
      .filter(([, v]) => v === "declaration")
      .map(([k]) => k);
    const emitted = new Set(Object.keys(normalizeCapabilityDeclaration(FULL)));
    const claimedButAbsent = declared.filter((k) => !emitted.has(k));
    expect(
      claimedButAbsent,
      `Claimed as declaration but never emitted: ${claimedButAbsent.join(", ")}`,
    ).toEqual([]);
  });

  it("a key in the digest is a column that claims to be in the declaration", () => {
    // The other direction: the normalizer cannot bind something the map calls
    // excluded, which would make the recorded reasoning false.
    const emitted = Object.keys(normalizeCapabilityDeclaration(FULL)).filter(
      (k) => !SYNTHETIC.has(k),
    );
    const notDeclared = emitted.filter(
      (k) => CAPABILITY_COLUMN_DISPOSITION[k] !== "declaration",
    );
    expect(
      notDeclared,
      `Emitted into the digest but not classified as declaration: ${notDeclared.join(", ")}`,
    ).toEqual([]);
  });

  it("each of the three fields Phase 4 excluded now moves the digest", async () => {
    // Not a restatement of the map — proof that including them was real.
    // Phase 4 excluded these as metadata; they decide whether a request is
    // SERVED (require_fresh + grade C is a refusal) and what the audit body
    // records as the source (data_source ?? name).
    const { declarationDigest } = await import("./manifest-snapshot.js");
    const base = declarationDigest(normalizeCapabilityDeclaration(FULL));
    const moves: Array<[string, Partial<CapabilityDeclarationSource>]> = [
      ["name", { name: "VAT Validate (EU)" }],
      ["dataUpdateCycleDays", { dataUpdateCycleDays: 31 }],
      ["datasetLastUpdated", { datasetLastUpdated: new Date("2026-08-02T00:00:00.000Z") }],
    ];
    for (const [label, patch] of moves) {
      const moved = declarationDigest(normalizeCapabilityDeclaration({ ...FULL, ...patch }));
      expect(moved, `${label} did not move the declaration digest`).not.toBe(base);
    }
  });

  it("dataset_last_updated is bound as a stable UTC string, not a Date", async () => {
    // A Date is not canonicalizable, and two Dates built differently for the
    // SAME instant must not produce different digests. Pinning the ISO form
    // inside the normalizer is what makes that true; if someone later passes
    // the Date straight through, this fails.
    const { declarationDigest } = await import("./manifest-snapshot.js");
    const a = declarationDigest(
      normalizeCapabilityDeclaration({
        ...FULL,
        datasetLastUpdated: new Date("2026-08-01T00:00:00.000Z"),
      }),
    );
    const b = declarationDigest(
      normalizeCapabilityDeclaration({
        ...FULL,
        datasetLastUpdated: new Date(Date.UTC(2026, 7, 1, 0, 0, 0, 0)),
      }),
    );
    expect(b).toBe(a);

    const emitted = normalizeCapabilityDeclaration(FULL);
    expect(typeof emitted.dataset_last_updated).toBe("string");
    expect(emitted.dataset_last_updated).toBe("2026-08-01T00:00:00.000Z");
  });
});
