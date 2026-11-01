import { configDefaults, defineConfig } from "vitest/config";

/**
 * Test files that read documentation: a path a docs-only PR can change
 * (docs/, archive/, handoff/, a root *.md — `isDocsPath` in
 * scripts/production-watch/classify.mjs), or a whole-tree `git grep`.
 *
 * CI skips the `code` project on a docs-only PR and always runs `docs`, so a
 * docs-only PR that breaks one of these fails on the PR rather than on main.
 * The list is not trusted: CI runs `code` under
 * scripts/ci/run-without-docs-reads.mjs, which fails if anything in it reads
 * a docs path — a test that starts reading docs has to move here.
 */
export const DOCS_READERS = [
  "src/capabilities/risk-narrative-generate.registry-status.test.ts",
  "src/lib/charter-authorization-binding.test.ts",
  "src/lib/claude-md-protocols.test.ts",
  "src/lib/free-tier-rate-limit.test.ts",
  "src/lib/vendor-terms.test.ts",
  "src/lib/wallet-service.guard.test.ts",
  "src/lib/withdrawn-integrity-claims.test.ts",
  "test/guard-production-write-access.test.ts",
];

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    setupFiles: ["./src/test-env-setup.ts"],
    testTimeout: 10_000,
    // beforeAll hooks that bootstrap the capability registry parse 313
    // manifests and dynamic-import ~300 executors. Under full-suite
    // parallel load with FS contention this can exceed the default 10s,
    // so give bootstrap hooks more headroom while keeping individual
    // test timeouts tight.
    hookTimeout: 30_000,
    // `vitest run` runs both; CI runs them as separate steps
    // (`--project code` gated on docs_only, `--project docs` always).
    projects: [
      {
        extends: true,
        test: {
          name: "code",
          include: ["src/**/*.test.ts", "test/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...DOCS_READERS],
        },
      },
      { extends: true, test: { name: "docs", include: DOCS_READERS } },
    ],
  },
});
