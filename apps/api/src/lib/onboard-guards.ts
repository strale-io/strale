/**
 * CLI flag guards for scripts/onboard.ts.
 *
 * Lives in src/lib/ (not scripts/) so vitest can cover it —
 * the vitest include glob is "src/**\/*.test.ts".
 */

/**
 * F-B-005: `--discover` executes the real capability handler (paid API
 * calls) and rewrites the manifest on disk. `--dry-run` semantically
 * promises no side effects. Combining the two is a surprising footgun —
 * fail loud with an actionable message instead of silently dropping
 * either flag.
 */
export function assertDiscoverNotDryRun(dryRun: boolean, discover: boolean): void {
  if (dryRun && discover) {
    throw new Error(
      "--discover requires live execution and cannot be combined with --dry-run.\n" +
        "  Discovery calls the real capability executor (paid API calls) and writes\n" +
        "  the regenerated manifest to disk. --dry-run promises no side effects.\n" +
        "  Re-run without --dry-run to perform discovery, or use --dry-run alone to\n" +
        "  preview an insert.",
    );
  }
}
