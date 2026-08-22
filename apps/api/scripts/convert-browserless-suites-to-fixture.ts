/**
 * Browserless harness-burn mitigation — suite test_mode conversion
 * (2026-08-18, branch `ops/cut-browserless-harness-burn`).
 *
 * Finding (verified against prod, read-only, 2026-08-18): Browserless
 * consumed ~22,306 calls in 30 days; 12 `cost_class = 'free_unlimited'`
 * capabilities whose test suites run `test_mode = 'live'` on the normal
 * hourly schedule accounted for the large majority of it (~7,565 real
 * executor invocations/30d across their 5 executor-touching suite types —
 * `dependency_health` / `edge_case` / `known_answer` / `known_bad` /
 * `negative` — the `schema_check` suites in the same 12 capabilities never
 * touched Browserless at all; they already dry-run regardless of
 * test_mode).
 *
 * This script converts, per capability, ONE suite (preferring
 * `known_answer`, falling back to `dependency_health`) to
 * `test_mode = 'canary'` (24h floor — see `minRetestIntervalHours` in
 * `apps/api/src/jobs/test-scheduler.ts`), and every other executor-touching
 * suite to `test_mode = 'fixture'` (zero-cost baseline replay once a
 * baseline exists; max-age-refreshed every ~30d — see
 * `checkBaselineStaleness` in `apps/api/src/lib/test-runner.ts`).
 * `schema_check`, `regression`, and `piggyback` suites are never touched.
 * Capabilities outside the hardcoded 12 (`TARGET_SLUGS` in
 * `../src/lib/browserless-suite-migration.ts`) are never touched. A
 * capability with no active `known_answer`/`dependency_health` suite to
 * keep live is refused entirely rather than left with zero live suites
 * (`refused_no_live_candidate` — see that module's EDGE case doc). All
 * planning logic is pure and unit-tested in that module — this script is a
 * thin DB read/write wrapper.
 *
 * Usage:
 *   cd apps/api
 *   npx tsx --env-file=<path-to-root>/.env scripts/convert-browserless-suites-to-fixture.ts
 *       # dry-run (default) — prints the plan, writes nothing
 *   npx tsx --env-file=<path-to-root>/.env scripts/convert-browserless-suites-to-fixture.ts --apply
 *       # writes for real — GATED, orchestrator-only per CLAUDE.md's
 *       # escalation contract (this is a suite-modification script; the
 *       # session brief requires --apply to be an explicit, separate step)
 *   ... --slug screenshot-url [--slug html-to-pdf ...]
 *       # restrict to one or more of the 12 (repeatable flag). Any slug
 *       # outside TARGET_SLUGS is rejected loudly, not silently ignored.
 *
 * Concurrency (widened per Codex review, 2026-08-18 round 1 — MEDIUM-4):
 * each --apply write is a CAS-guarded single-row UPDATE asserting
 * `id`, `active = true`, `test_type`, `capability_slug`, AND
 * `test_mode IS NOT DISTINCT FROM <the exact mode this run planned
 * against>` — not just the test_mode check alone. A suite that changed
 * shape (deactivated, retyped, or reassigned) between plan and apply is
 * exactly as much a race as one whose test_mode alone changed; the wider
 * WHERE catches both. 0 rows affected is reported as "raced — skipped",
 * never silently overwritten — same convention as
 * `repair-limitation-titles.ts`. Writes are independent per-suite UPDATEs,
 * not one big transaction: a problem on one suite must not roll back 59
 * other correct conversions, and no suite's write depends on another's.
 *
 * Round 2 (2026-08-18 — MEDIUM): for `bumpUpdatedAt: true` plans, the CAS
 * ALSO asserts `baseline_captured_at IS NOT DISTINCT FROM` the value this
 * run observed at plan time. The test_mode check alone can't see a
 * successful live recapture that lands on the suite between plan and
 * apply (its normal scheduled dispatch fires mid-script and captures a
 * fresh baseline) — that race advances baseline_captured_at without
 * touching test_mode. Applying the stale plan anyway would bump
 * updated_at past the suite's brand-new baseline_captured_at, immediately
 * re-triggering edit-invalidation staleness on a baseline that had just
 * become fresh: the exact unnecessary-recapture problem HIGH-2a fixed,
 * reintroduced through the race window. `bumpUpdatedAt: false` plans don't
 * need this — their UPDATE never touches updated_at, so a concurrent
 * capture can't be invalidated by it.
 *
 * HIGH-2a (Codex review, round 1): `updated_at` is bumped ONLY for plans
 * where `bumpUpdatedAt` is true (baseline missing/already stale at plan
 * time — see browserless-suite-migration.ts). A suite whose baseline is
 * already fresh gets ONLY its `test_mode` flipped, so the conversion
 * itself never manufactures an unnecessary live recapture.
 */

import { openOperatorWriteDb } from "../src/lib/operator-db.js";
import { autonomousAuthority } from "../src/lib/production-authority.js";
import {
  planMigration,
  TARGET_SLUGS,
  type SuiteRow,
} from "../src/lib/browserless-suite-migration.js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const slugFilterArgs: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--slug") {
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) {
      console.error("--slug requires a value");
      process.exit(1);
    }
    slugFilterArgs.push(v);
    i++;
  }
}

function resolveTargetSlugs(): string[] {
  if (slugFilterArgs.length === 0) return [...TARGET_SLUGS];
  const invalid = slugFilterArgs.filter((s) => !TARGET_SLUGS.includes(s));
  if (invalid.length > 0) {
    console.error(
      `--slug value(s) not in the 12-capability scope, refusing: ${invalid.join(", ")}\n` +
        `Valid slugs: ${TARGET_SLUGS.join(", ")}`,
    );
    process.exit(1);
  }
  return slugFilterArgs;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set. Run with --env-file=<path>/.env");
    process.exit(1);
  }

  const targetSlugs = resolveTargetSlugs();
  const sql = openOperatorWriteDb(autonomousAuthority("fixture_refresh", "DEC-20260812-A"));

  try {
    const rows = await sql<
      {
        id: string;
        capabilitySlug: string;
        testType: string;
        testMode: string | null;
        active: boolean;
        hasBaseline: boolean;
        baselineCapturedAt: Date | null;
        updatedAt: Date | null;
      }[]
    >`
      SELECT id::text AS "id", capability_slug AS "capabilitySlug",
             test_type AS "testType", test_mode AS "testMode", active,
             (baseline_output IS NOT NULL) AS "hasBaseline",
             baseline_captured_at AS "baselineCapturedAt",
             updated_at AS "updatedAt"
      FROM test_suites
      WHERE capability_slug = ANY(${targetSlugs})
      ORDER BY capability_slug, test_type
    `;

    const suites: SuiteRow[] = rows.map((r) => ({
      id: r.id,
      capabilitySlug: r.capabilitySlug,
      testType: r.testType,
      testMode: r.testMode,
      active: r.active,
      hasBaseline: r.hasBaseline,
      baselineCapturedAt: r.baselineCapturedAt,
      updatedAt: r.updatedAt,
    }));

    if (suites.length === 0) {
      console.log("No test_suites rows found for the requested slugs. Nothing to do.");
      return;
    }

    const plans = planMigration(suites);

    // ── Report ──────────────────────────────────────────────────────────
    const actionable = plans.filter(
      (p) => p.action === "convert_to_canary" || p.action === "convert_to_fixture",
    );
    const unchanged = plans.filter((p) => p.action === "unchanged");
    const notTargeted = plans.filter((p) => p.action === "not_targeted");
    const refused = plans.filter((p) => p.action === "refused_no_live_candidate");

    console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes)"}`);
    console.log(`Capabilities in scope: ${targetSlugs.join(", ")}`);
    console.log(`Suites read: ${suites.length}\n`);

    console.log("── Planned changes ──────────────────────────────────────────");
    for (const p of actionable) {
      console.log(
        `  ${p.capabilitySlug.padEnd(24)} ${p.testType.padEnd(18)} ` +
          `${(p.currentMode ?? "live").padEnd(8)} -> ${p.targetMode!.padEnd(8)}  ` +
          `[bump_updated_at=${p.bumpUpdatedAt}]  ${p.reason}`,
      );
    }
    if (actionable.length === 0) console.log("  (none — every suite already at its target mode)");

    if (refused.length > 0) {
      console.log("\n── REFUSED — capability has no live candidate (EDGE case) ─────");
      const refusedSlugs = [...new Set(refused.map((p) => p.capabilitySlug))];
      for (const slug of refusedSlugs) {
        console.log(`  ${slug}: ${refused.find((p) => p.capabilitySlug === slug)!.reason}`);
      }
    }

    console.log("\n── Already correct (unchanged) ──────────────────────────────");
    for (const p of unchanged) {
      console.log(`  ${p.capabilitySlug.padEnd(24)} ${p.testType.padEnd(18)} ${p.targetMode}`);
    }

    console.log("\n── Not touched ───────────────────────────────────────────────");
    for (const p of notTargeted) {
      console.log(`  ${p.capabilitySlug.padEnd(24)} ${p.testType.padEnd(18)} ${p.reason}`);
    }

    console.log(
      `\nSummary: ${actionable.length} to convert, ${unchanged.length} already correct, ` +
        `${notTargeted.length} not touched, ${refused.length} refused (${new Set(refused.map((p) => p.capabilitySlug)).size} capabilities).`,
    );

    if (!APPLY) {
      console.log("\nDry-run only — no writes made. Re-run with --apply to write.");
      return;
    }

    // ── Apply ───────────────────────────────────────────────────────────
    console.log("\n── Applying ─────────────────────────────────────────────────");
    let applied = 0;
    let raced = 0;
    for (const p of actionable) {
      // CAS-guarded: only write if the suite still matches every shape this
      // run planned against — id, still active, still the same test_type
      // and capability_slug, and test_mode unchanged since the plan was
      // read. IS NOT DISTINCT FROM handles the NULL case (schema default is
      // 'live' but the column itself is nullable). updated_at is bumped
      // only when the plan calls for it (HIGH-2a) — two separate statement
      // shapes rather than a conditional NOW()/NULL expression, so the
      // "don't touch updated_at" case can never accidentally write a NULL
      // into a NOT NULL column via a mis-built CASE.
      //
      // MEDIUM (Codex review, 2026-08-18 round 2): for a bumpUpdatedAt=true
      // plan, ALSO assert baseline_captured_at is unchanged from what this
      // run observed. Without it, a successful live recapture landing on
      // this suite between plan and apply (its normal scheduled dispatch
      // fires and captures a fresh baseline while this script is running)
      // advances baseline_captured_at without touching test_mode — the
      // test_mode check alone can't see that race. Applying the stale plan
      // anyway would bump updated_at past the suite's BRAND NEW
      // baseline_captured_at, immediately re-triggering edit-invalidation
      // staleness on a baseline that had just become fresh: the exact
      // unnecessary-recapture problem HIGH-2a fixed, reintroduced through
      // the race window. A bumpUpdatedAt=false plan's UPDATE never touches
      // updated_at, so a concurrent capture can't be invalidated by it —
      // no extra guard needed there (see SuitePlan.observedBaselineCapturedAt's
      // doc comment in browserless-suite-migration.ts for the full case).
      const result = p.bumpUpdatedAt
        ? await sql`
            UPDATE test_suites
            SET test_mode = ${p.targetMode}, updated_at = NOW()
            WHERE id = ${p.id}::uuid
              AND active = true
              AND test_type = ${p.testType}
              AND capability_slug = ${p.capabilitySlug}
              AND test_mode IS NOT DISTINCT FROM ${p.currentMode}
              AND baseline_captured_at IS NOT DISTINCT FROM ${p.observedBaselineCapturedAt}
          `
        : await sql`
            UPDATE test_suites
            SET test_mode = ${p.targetMode}
            WHERE id = ${p.id}::uuid
              AND active = true
              AND test_type = ${p.testType}
              AND capability_slug = ${p.capabilitySlug}
              AND test_mode IS NOT DISTINCT FROM ${p.currentMode}
          `;
      if (result.count > 0) {
        applied++;
      } else {
        raced++;
        console.warn(
          `  [raced — skipped] ${p.capabilitySlug} / ${p.testType} (id ${p.id}): ` +
            `suite changed shape since this run's plan was read; not overwritten`,
        );
      }
    }
    console.log(`\nApplied ${applied}/${actionable.length} planned conversions. ${raced} raced and were skipped.`);
    if (raced > 0) {
      console.log("Re-run the script (dry-run first) to see current state and retry any raced suites.");
    }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
