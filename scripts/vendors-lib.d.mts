// Types for the parts of scripts/vendors-lib.mjs that TypeScript callers use.
//
// Why this file exists: apps/api/tsconfig.scripts.json type-checks .ts and
// .mts under apps/api/scripts but deliberately does not check .mjs (see that
// config's DECLARED BOUNDARY comment: turning on checkJs surfaced far too many
// pre-existing errors to fix in one pass). A checked .ts importing an unchecked
// .mjs therefore fails with TS7016, implicit any. M4 batch 6 made
// apps/api/scripts/check-vendor-roster-drift.ts the first such importer.
//
// Hand-authored rather than generated, so it is a contract that can drift from
// the implementation. Keep it narrow: declare only what a caller uses, so the
// surface that can drift stays small. If a caller needs more, widen it here
// and check the shape against the implementation at that time.
//
// The alternative considered and rejected was allowJs plus checkJs for this
// project, which the tsconfig already records as too large a change to make as
// a side effect of another batch.

/** One problem found by a vendor-register check. */
export interface VendorFinding {
  /** Stable machine-readable code, for example VENDOR_VIEW_STALE. */
  code: string;
  /** Repository-relative path the finding is about. */
  file: string;
  /** Human-readable explanation, safe to print. */
  detail: string;
}

/** Repository-relative path of the vendor register. */
export const REGISTER_PATH: string;

/**
 * Every check the register enforces: schema validity, identifier and alias
 * uniqueness, lifecycle ordering, resolvable decision and evidence paths, and
 * agreement with the provider list, coverage matrix, environment manifest and
 * platform facts. Findings are failures; warnings are informational and must
 * not affect a caller's exit code.
 */
export function checkAllVendors(
  root: string,
  options?: { baseRef?: string },
): { findings: VendorFinding[]; warnings: VendorFinding[]; vendorCount: number };

/**
 * Whether the committed vendor view matches what rendering it now would
 * produce. Returns findings only; empty means fresh.
 */
export function checkVendorViewFresh(root: string): VendorFinding[];
