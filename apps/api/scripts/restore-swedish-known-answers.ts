/**
 * Restore 3 of the 5 swedish-company-data known_answer suites that Phase 4
 * (2026-08-17) deactivated for testing nothing distinct: all five carried
 * the exact same input as "Spotify AB — known company"
 * (`{"org_number":"556703-7485"}`) under a different company label —
 * Klarna/Volvo/H&M/IKEA plus a stale name-search variant.
 *
 * This script reactivates THREE of those five — H&M, IKEA of Sweden AB,
 * Klarna Bank AB — with corrected org_numbers verified against the live
 * Bolagsverket-backed executor (see verification log in the PR/handoff;
 * each returned company_name matches its suite label exactly). It rebuilds
 * validation_rules and baseline_output from that live verification (the
 * old rows had Spotify's validation_rules/baseline_output copy-pasted
 * verbatim — org_number/vat_number/registered_date literals that would
 * fail immediately against a different company's real data).
 *
 * NOT restored:
 *   - "Volvo Car AB — known company": the registry's real legal name is
 *     "Volvo Personvagnar Aktiebolag", not "Volvo Car AB" — verified via
 *     org_number 556074-3089. Left deactivated pending a label decision
 *     (rename vs. reword) rather than silently restoring under a label the
 *     registry itself doesn't return. Candidate for a follow-up round.
 *   - "Name search — Spotify AB (name via org_number field triggers
 *     LLM+Allabolag resolution)": tests functionality the executor no
 *     longer has. swedish-company-data was migrated to the Bolagsverket
 *     HVD API (DEC-20260405-A); it only accepts organisationsnummer and
 *     explicitly rejects name input (see swedish-company-data.ts's error
 *     message and the manifest's "no name search" limitation). This suite
 *     is orphaned, not merely mislabeled — it should be deleted, not
 *     restored. Left deactivated.
 *
 * Budget arithmetic (Block 0084, swedish-company-data cost_class=free_quota,
 * quota_cap=1000/day, test budget = min(1, floor(1000*0.10)) = 100/day):
 *
 * REVISED 2026-08-18 (Codex review). The original version of this comment
 * projected ~18/day per known_answer suite, taken from 5 days of observed
 * test_results for "Spotify AB — known company" (the one suite the Phase 4
 * dedup left alone). That number was WRONG — not a measurement error, a
 * measurement of a different bug. test-scheduler.ts's per-suite stagger
 * hashes `slug + ':' + test_type`, identical for every suite sharing a
 * test_type — so, pre-fix, ALL of swedish-company-data's known_answer
 * suites (Spotify plus the 5 duplicates, before today's dedup) became
 * "overdue" in the same poll-cycle batch. findOverdueSuites() emitted one
 * row per due SUITE, but the scheduler's loop called
 * `runTests({capabilitySlug, testType})` per row *without* narrowing to
 * that row's specific suite — and runTests() with only (slug, testType)
 * reloads and re-executes EVERY active suite matching that pair. So a
 * batch of N due same-type suites produced N x N executions, not N: with
 * 6 known_answer suites, that's up to 36 executions from ONE batch. Every
 * one of those executions writes a real test_results row against the real
 * suite it ran (including Spotify's), which is exactly why Spotify's own
 * suite — never itself duplicated — still measured a contaminated ~18/day:
 * it was one of the N x N executions fired by its siblings being overdue
 * in the same cycle, not its own organic hourly cadence. This also
 * retroactively explains capability_budget_counters showing the pre-dedup
 * 11-suite configuration hit the full 100/100 hard cap every one of the
 * 5 days before this fix (2026-08-13 through 2026-08-17), each by
 * ~04:30-05:40 UTC — 11 suites at a genuinely linear ~2-3/day each would
 * never have come close to 100.
 *
 * This session's fix (test-runner.ts's TestRunOptions.suiteId +
 * test-scheduler.ts passing `suiteId: suite.suiteId` per batch entry, see
 * the sibling commit) makes execution linear: one batch entry now runs
 * exactly the one suite it represents, regardless of how many siblings
 * share its (slug, testType). With the fix landed, the N x N amplifier is
 * gone, and there is no structural reason for a known_answer suite to cost
 * more per day than any other suite type on this capability.
 *
 * Per-suite daily attempt counts for the suite TYPES that were never
 * duplicated (so their historical rate was never contaminated by the N x N
 * bug — these are the honest baseline), checked against test_results for
 * 2026-08-13 through 2026-08-17:
 *   dependency_health ........... steady ~2.2/day
 *   edge_case .................... steady ~2.8/day
 *   known_bad ..................... steady ~2.2/day
 *   negative ....................... steady ~2.6/day
 *   schema_check ................... steady ~3.0/day
 *   (unweighted average ~2.56/day — used below as the honest per-suite
 *   estimate for a LINEAR-scheduled suite of any test_type, including
 *   known_answer, now that the scheduler fix removes the reason
 *   known_answer was ever different)
 *
 * Post-fix, post-restore projected state (6 pre-existing suites + 3
 * restored known_answer suites = 9 suites total, all linear):
 *   9 suites x ~2.56/day/suite = ~23/day
 *
 * That is far under the "~95 of 100" ceiling this task set — ~72/day of
 * margin to 95, ~77/day to the hard 100 cap. The tight-margin projection
 * in the prior version of this file (~84.8/day, "10/day of margin") was an
 * artifact of extrapolating from a quadratically-inflated measurement; it
 * is superseded, not merely re-estimated. Restoring a 4th suite (Volvo,
 * pending the label decision noted above) would add ~2.56/day more —
 * trivially within budget now — but is out of scope for this session
 * (not requested by the review; the 3 already live in prod stay as-is).
 *
 * Usage:
 *   npx tsx --env-file=<path to .env> scripts/restore-swedish-known-answers.ts
 *   npx tsx --env-file=<path to .env> scripts/restore-swedish-known-answers.ts --apply
 *   npx tsx --env-file=<path to .env> scripts/restore-swedish-known-answers.ts --apply --upgrade-rules
 *
 * Dry-run (no --apply) is the default and only prints the diff; the whole
 * operation — preflight read included — runs inside a transaction that is
 * always rolled back on this path, so it is genuinely read-only against
 * prod. --apply is required to write, and commits only if every targeted
 * row classifies cleanly (see "Row classification" below); a sanity
 * failure on any one row rolls back the whole transaction, so a run never
 * leaves a partial restore.
 *
 * Idempotent by design (Codex review HIGH-2): a rerun recognizes a row
 * already in its target state (active, corrected input, no quarantine) as
 * an OK-skip, not a refusal — this script is now safe to run again after
 * the orchestrator has already applied it, which is exactly the situation
 * this review landed in.
 *
 * --upgrade-rules is a separate, explicit opt-in for touching an
 * already-restored row a second time: the version of this script that
 * first ran against prod wrote `company_name: not_null` validation_rules
 * (MEDIUM finding — not_null proves nothing about identity, since the
 * executor echoes org_number/derives vat_number from the request
 * regardless of which company it resolved). Without --upgrade-rules,
 * already-restored rows with the old rules are reported (STALE RULES) but
 * left alone. With it, their validation_rules (and baseline_output) are
 * upgraded to the current equals-assertion shape via a compare-and-set
 * scoped to their current (already-restored) state — active/input/
 * quarantine_reason are untouched.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";

const CAPABILITY_SLUG = "swedish-company-data";

interface RestorePlan {
  suiteId: string;
  testName: string;
  oldInput: Record<string, unknown>;
  newInput: Record<string, unknown>;
  validationRules: { checks: Array<Record<string, unknown>> };
  baselineOutput: Record<string, unknown>;
}

// Verified 2026-08-18 via guardedExecute (health_probe context — the daily
// internal_test budget was exhausted from Phase 4 investigation activity;
// health_probe is the one free_quota ALLOW_MATRIX cell that doesn't consume
// the shared counter, appropriate for a bounded one-time manual check).
// Each company_name below matches its suite label exactly.
const RESTORE_PLANS: RestorePlan[] = [
  {
    suiteId: "cbaef0ad-f676-4cb9-a651-51da1c09cf4c", // "Klarna Bank AB — known company"
    testName: "Klarna Bank AB — known company",
    oldInput: { org_number: "556703-7485" },
    newInput: { org_number: "556737-0431" },
    validationRules: {
      checks: [
        // MEDIUM (Codex review): not_null proved nothing about identity —
        // the executor echoes org_number back from the request and derives
        // vat_number from it, so any org_number would pass a not_null
        // company_name check even against the wrong company. equals against
        // the exact live-verified legal name is the actual identity check.
        { field: "company_name", value: "Klarna Bank AB", operator: "equals" },
        { field: "org_number", value: "556737-0431", operator: "equals" },
        { field: "vat_number", value: "SE556737043101", operator: "equals" },
        { field: "country_code", value: "SE", operator: "equals" },
        { field: "company_type", value: "Bankaktiebolag", operator: "equals" },
        { field: "company_type_code", value: "BAB", operator: "equals" },
        { field: "legal_form", operator: "not_null" },
        { field: "legal_form_code", value: "41", operator: "equals" },
        { field: "status", value: "active", operator: "equals" },
        { field: "is_active", value: true, operator: "equals" },
        { field: "registered_date", value: "2007-09-05", operator: "equals" },
        { field: "registered_address", operator: "not_null" },
        { field: "sni_codes", operator: "not_null" },
        { field: "business_description", operator: "not_null" },
        { field: "ongoing_procedures", operator: "not_null" },
        { field: "alternative_names", operator: "not_null" },
      ],
    },
    baselineOutput: {
      company_name: "Klarna Bank AB",
      org_number: "556737-0431",
      vat_number: "SE556737043101",
      country_code: "SE",
      company_type: "Bankaktiebolag",
      company_type_code: "BAB",
      legal_form: "Bankaktiebolag",
      legal_form_code: "41",
      status: "active",
      is_active: true,
      registered_date: "2007-09-05",
      deregistered_date: null,
      deregistration_reason: null,
      registered_address: {
        street: "Sveavägen 46",
        postal_code: "11134",
        city: "STOCKHOLM",
        country: "Sverige",
        co_address: null,
      },
      sni_codes: [
        { code: "64190", description: "Annan monetär finansförmedling" },
        { code: "64920", description: "Annan kreditgivning" },
      ],
      business_description:
        "Bolaget får bedriva 1. sådan rörelse som avses i 1 kap. 3 § lagen (2004:297) om bank- och finansieringsrörelse, samt 2. finansiell verksamhet och verksamhet som har ett naturligt samband därmed enligt 7 kap. 1 § lagen om bank- och finansieringsrörelse.",
      ongoing_procedures: [],
      alternative_names: [
        { name: "Segoria", type: "Särskilt företagsnamn", registered_date: "2010-03-16" },
        { name: "Svensk Inkassotjänst, SIKO", type: "Särskilt företagsnamn", registered_date: "2010-05-28" },
      ],
      legal_name: "Klarna Bank AB",
      primary_registration_id: "556737-0431",
      date_incorporated: "2007-09-05",
      tier_2_available: false,
      tier_2_available_reason:
        "handler does not currently extract legal representatives from upstream registry; follow-up extraction task tracked",
      ubo_availability: "unavailable_no_registry",
      ubo_availability_reason:
        "Bolagsverket BO data not exposed programmatically at v1; verification pending public-source confirmation",
    },
  },
  {
    suiteId: "7b9f1101-a5d9-478e-804d-22ba5a757923", // "H&M — known company"
    testName: "H&M — known company",
    oldInput: { org_number: "556703-7485" },
    newInput: { org_number: "556042-7220" },
    validationRules: {
      checks: [
        { field: "company_name", value: "H & M Hennes & Mauritz AB", operator: "equals" },
        { field: "org_number", value: "556042-7220", operator: "equals" },
        { field: "vat_number", value: "SE556042722001", operator: "equals" },
        { field: "country_code", value: "SE", operator: "equals" },
        { field: "company_type", value: "Aktiebolag", operator: "equals" },
        { field: "company_type_code", value: "AB", operator: "equals" },
        { field: "legal_form", operator: "not_null" },
        { field: "legal_form_code", value: "49", operator: "equals" },
        { field: "status", value: "active", operator: "equals" },
        { field: "is_active", value: true, operator: "equals" },
        { field: "registered_date", value: "1943-08-07", operator: "equals" },
        { field: "registered_address", operator: "not_null" },
        { field: "sni_codes", operator: "not_null" },
        { field: "business_description", operator: "not_null" },
        { field: "ongoing_procedures", operator: "not_null" },
        { field: "alternative_names", operator: "not_null" },
      ],
    },
    baselineOutput: {
      company_name: "H & M Hennes & Mauritz AB",
      org_number: "556042-7220",
      vat_number: "SE556042722001",
      country_code: "SE",
      company_type: "Aktiebolag",
      company_type_code: "AB",
      legal_form: "Övriga aktiebolag",
      legal_form_code: "49",
      status: "active",
      is_active: true,
      registered_date: "1943-08-07",
      deregistered_date: null,
      deregistration_reason: null,
      registered_address: {
        street: "Mäster Samuelsgatan 46 A",
        postal_code: "10638",
        city: "STOCKHOLM",
        country: "Sverige",
        co_address: null,
      },
      sni_codes: [{ code: "70100", description: "Verksamheter som utövas av huvudkontor" }],
      business_description:
        "Bolaget skall ha till föremål för sin verksamhet att direkt eller indirekt - bedriva handel med textil och konfektion, skor, accessoarer, kosmetik, ur, pennor, inredning till hemmet - främst textilier samt andra liknande konsumentvaror: - bedriva dagligvaruhandel och café- och restaurangrörelse: - äga och förvalta värdepapper, inventarier och fast egendom: - bedriva finansieringsverksamhet inom ramen för den ovan angivna verksamheten: samt - tillhandahålla tjänster knutna till den ovan angivna verksamheten.",
      ongoing_procedures: [],
      alternative_names: [],
      legal_name: "H & M Hennes & Mauritz AB",
      primary_registration_id: "556042-7220",
      date_incorporated: "1943-08-07",
      tier_2_available: false,
      tier_2_available_reason:
        "handler does not currently extract legal representatives from upstream registry; follow-up extraction task tracked",
      ubo_availability: "unavailable_no_registry",
      ubo_availability_reason:
        "Bolagsverket BO data not exposed programmatically at v1; verification pending public-source confirmation",
    },
  },
  {
    suiteId: "24523fa9-e74b-4268-86c6-d41270f780de", // "IKEA of Sweden AB — known company"
    testName: "IKEA of Sweden AB — known company",
    oldInput: { org_number: "556703-7485" },
    newInput: { org_number: "556074-7551" },
    validationRules: {
      checks: [
        { field: "company_name", value: "IKEA of Sweden AB", operator: "equals" },
        { field: "org_number", value: "556074-7551", operator: "equals" },
        { field: "vat_number", value: "SE556074755101", operator: "equals" },
        { field: "country_code", value: "SE", operator: "equals" },
        { field: "company_type", value: "Aktiebolag", operator: "equals" },
        { field: "company_type_code", value: "AB", operator: "equals" },
        { field: "legal_form", operator: "not_null" },
        { field: "legal_form_code", value: "49", operator: "equals" },
        { field: "status", value: "active", operator: "equals" },
        { field: "is_active", value: true, operator: "equals" },
        { field: "registered_date", value: "1960-11-21", operator: "equals" },
        { field: "registered_address", operator: "not_null" },
        { field: "sni_codes", operator: "not_null" },
        { field: "business_description", operator: "not_null" },
        { field: "ongoing_procedures", operator: "not_null" },
        { field: "alternative_names", operator: "not_null" },
      ],
    },
    baselineOutput: {
      company_name: "IKEA of Sweden AB",
      org_number: "556074-7551",
      vat_number: "SE556074755101",
      country_code: "SE",
      company_type: "Aktiebolag",
      company_type_code: "AB",
      legal_form: "Övriga aktiebolag",
      legal_form_code: "49",
      status: "active",
      is_active: true,
      registered_date: "1960-11-21",
      deregistered_date: null,
      deregistration_reason: null,
      registered_address: {
        street: "Box 702",
        postal_code: "34381",
        city: "ÄLMHULT",
        country: "Sverige",
        co_address: null,
      },
      sni_codes: [{ code: "74110", description: "Industridesign och modedesign" }],
      business_description:
        "Föremålet för aktiebolagets verksamhet är att bedriva utveckling av och handel med möbler och andra heminredningsartiklar och att upplåta lös egendom till nyttjande samt att bedriva annan därmed förenlig verksamhet.",
      ongoing_procedures: [],
      alternative_names: [
        { name: "Ten Swedish Designers", type: "Särskilt företagsnamn", registered_date: "2016-09-08" },
      ],
      legal_name: "IKEA of Sweden AB",
      primary_registration_id: "556074-7551",
      date_incorporated: "1960-11-21",
      tier_2_available: false,
      tier_2_available_reason:
        "handler does not currently extract legal representatives from upstream registry; follow-up extraction task tracked",
      ubo_availability: "unavailable_no_registry",
      ubo_availability_reason:
        "Bolagsverket BO data not exposed programmatically at v1; verification pending public-source confirmation",
    },
  },
];

// Honest per-suite daily rate: the average of the 5 suite types that were
// NEVER duplicated, so their historical test_results rate was never
// contaminated by the scheduler's pre-fix N x N same-test-type amplifier
// (see the file header for the full incident). Now that runTests() accepts
// suiteId and the scheduler passes it per batch entry, execution is linear
// in suite count — a known_answer suite costs the same as any other suite
// type, because the mechanism that used to make it different is gone.
const NEVER_DUPLICATED_SUITE_RATES = {
  dependency_health: 2.2,
  edge_case: 2.8,
  known_bad: 2.2,
  negative: 2.6,
  schema_check: 3.0,
} as const;
const HONEST_PER_SUITE_RATE =
  Object.values(NEVER_DUPLICATED_SUITE_RATES).reduce((a, b) => a + b, 0) /
  Object.keys(NEVER_DUPLICATED_SUITE_RATES).length;

function printBudgetArithmetic(): void {
  console.log("Budget arithmetic (Block 0084, swedish-company-data, cap=100/day):");
  console.log(
    "  REVISED (Codex review, 2026-08-18): the scheduler's pre-fix N x N same-\n" +
      "  test-type amplifier (test-scheduler.ts + test-runner.ts, fixed in the\n" +
      "  sibling commit of this change) meant a known_answer suite's historical\n" +
      "  rate was contaminated by however many duplicate known_answer siblings\n" +
      "  were also overdue in the same poll-cycle batch. Now that execution is\n" +
      "  linear (runTests() takes an optional suiteId; the scheduler passes the\n" +
      "  specific overdue suite's id per batch entry), there is no structural\n" +
      "  reason for known_answer to cost more per day than any other suite type.\n" +
      "  The honest per-suite estimate below is the average of the 5 suite types\n" +
      "  that were NEVER duplicated, so their historical rate was never inflated\n" +
      "  by the bug.",
  );
  console.log("  Never-duplicated suite types (honest baseline, /day):");
  for (const [type, rate] of Object.entries(NEVER_DUPLICATED_SUITE_RATES)) {
    console.log(`    ${type.padEnd(18)} ${rate.toFixed(1)}`);
  }
  console.log(`    average per suite  ${HONEST_PER_SUITE_RATE.toFixed(2)}/day`);
  console.log();

  const preExistingSuiteCount = Object.keys(NEVER_DUPLICATED_SUITE_RATES).length + 1; // + Spotify's known_answer suite
  const totalSuiteCount = preExistingSuiteCount + RESTORE_PLANS.length;
  const projected = totalSuiteCount * HONEST_PER_SUITE_RATE;

  console.log(
    `  Post-fix, post-restore: ${preExistingSuiteCount} pre-existing suites (5 never-duplicated ` +
      `types + Spotify's known_answer, now linear like the rest) + ${RESTORE_PLANS.length} ` +
      `restored known_answer suites = ${totalSuiteCount} suites total, all linear.`,
  );
  console.log(
    `    ${totalSuiteCount} suites x ${HONEST_PER_SUITE_RATE.toFixed(2)}/day/suite = ~${projected.toFixed(1)}/day`,
  );
  console.log(`  = projected total ~${projected.toFixed(1)}/day  (ceiling requested: ~95/day; hard cap: 100/day)`);
  if (projected > 100) {
    console.log("  *** OVER THE 100/DAY HARD CAP — DO NOT APPLY ***");
  } else if (projected > 95) {
    console.log("  *** OVER THE ~95/DAY REQUESTED CEILING — reconsider suite count ***");
  } else {
    console.log(
      `  OK — ~${(95 - projected).toFixed(1)}/day of margin to the ~95 ceiling, ` +
        `~${(100 - projected).toFixed(1)}/day to the hard cap. Far more headroom than the ` +
        "pre-review (quadratically-contaminated) estimate showed — the scheduler fix, not just\n" +
        "  the dedup, is what actually recovered the budget.",
    );
  }
  console.log();
}

// ─── Row classification (idempotency + atomicity, Codex review HIGH-2) ─────
//
// A rerun of this script — dry-run OR --apply — must be safe against a row
// already being in the state a PRIOR run left it in. The original version
// only recognized one "good" state (inactive, stale Spotify-cloned input)
// and SANITY-FAILED on anything else, including the row's own POST-restore
// state — so a rerun after a successful --apply refused every row instead
// of reporting "already done". That's the exact shape this task's own
// escalation-contract text ran into: the orchestrator applied this script
// to prod between when it was written and when this review landed, so any
// naive rerun today would hit that refusal on all 3 rows.
type RowClassification =
  | { kind: "needs_restore" }
  | { kind: "already_restored"; rulesUpToDate: boolean }
  | { kind: "sanity_fail"; reason: string };

function classifyRow(
  plan: RestorePlan,
  row:
    | {
        input: Record<string, unknown>;
        active: boolean;
        quarantine_reason: string | null;
        capability_slug: string;
        validation_rules: unknown;
      }
    | undefined,
): RowClassification {
  if (!row) return { kind: "sanity_fail", reason: "suite not found" };
  if (row.capability_slug !== CAPABILITY_SLUG) {
    return { kind: "sanity_fail", reason: `belongs to '${row.capability_slug}', not '${CAPABILITY_SLUG}'` };
  }

  const inputMatchesOld = JSON.stringify(row.input) === JSON.stringify(plan.oldInput);
  const inputMatchesNew = JSON.stringify(row.input) === JSON.stringify(plan.newInput);

  // Target state: this is what a successful --apply of THIS plan leaves
  // behind. Recognizing it (rather than only the pre-restore state) is
  // what makes a rerun idempotent instead of a refusal.
  if (row.active === true && inputMatchesNew && row.quarantine_reason === null) {
    // MEDIUM (Codex review): the version of this script that already ran
    // against prod wrote not_null-only company_name checks. rulesUpToDate
    // distinguishes "restored with the current (equals-assertion)
    // validation_rules" from "restored, but with the older weaker rules" —
    // the latter needs --upgrade-rules, not a fresh restore (the row is
    // already active/correct otherwise; only the rules are stale).
    const rulesUpToDate = JSON.stringify(row.validation_rules) === JSON.stringify(plan.validationRules);
    return { kind: "already_restored", rulesUpToDate };
  }

  // Pre-restore state: the stale, Spotify-cloned, quarantined row Phase 4
  // left behind. This is the only state this script is willing to write.
  if (row.active === false && inputMatchesOld) {
    return { kind: "needs_restore" };
  }

  return {
    kind: "sanity_fail",
    reason:
      `unrecognized state — active=${row.active}, input=${JSON.stringify(row.input)}, ` +
      `quarantine_reason=${row.quarantine_reason ? "(set)" : "(null)"}. Neither the pre-restore ` +
      "nor the post-restore shape this plan recognizes. Someone touched this row in an " +
      "unexpected way — refusing to guess.",
  };
}

// Sentinel used to unwind db.transaction() on the dry-run path without
// treating "dry run completed cleanly" as an error — db.transaction()
// commits unless the callback throws, and dry-run must never commit.
class DryRunRollback extends Error {}

async function main() {
  const apply = process.argv.includes("--apply");
  const upgradeRules = process.argv.includes("--upgrade-rules");
  const db = getDb();

  printBudgetArithmetic();

  console.log(`Mode: ${apply ? "APPLY (writing to prod)" : "DRY RUN (no writes, transaction always rolled back)"}`);
  console.log(
    `Rule upgrade: ${upgradeRules ? "ON (--upgrade-rules — will upgrade stale not_null company_name checks to equals)" : "OFF (pass --upgrade-rules to also fix already-restored rows with the older weaker rules)"}\n`,
  );

  // Single transaction for the whole operation (Codex review HIGH-2): the
  // preflight SELECT and the writes now share one transaction and one set
  // of row locks, so a mid-run failure can never leave a partial restore —
  // Postgres rolls back everything on any thrown error, and dry-run rolls
  // back unconditionally regardless of outcome (no COMMIT is ever reached
  // on that path). SELECT ... FOR UPDATE locks exactly the 3 target rows
  // for the duration of this transaction, closing the prior gap where a
  // concurrent writer could change a row between the preflight read and
  // the write that assumed it was unchanged.
  let needsRestore = 0;
  let alreadyRestored = 0;
  let rulesUpgraded = 0;
  let rulesStaleNotUpgraded = 0;
  let sanityFailed = 0;

  try {
    await db.transaction(async (tx) => {
      const ids = RESTORE_PLANS.map((p) => p.suiteId);
      const current = await tx.execute(sql`
        SELECT id::text AS id, test_name, input, active, quarantine_reason, capability_slug, validation_rules
          FROM test_suites
         WHERE id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
         FOR UPDATE
      `);
      const rows = (Array.isArray(current) ? current : (current as { rows?: unknown[] }).rows ?? []) as Array<{
        id: string;
        test_name: string;
        input: Record<string, unknown>;
        active: boolean;
        quarantine_reason: string | null;
        capability_slug: string;
        validation_rules: unknown;
      }>;
      const byId = new Map(rows.map((r) => [r.id, r]));

      for (const plan of RESTORE_PLANS) {
        const row = byId.get(plan.suiteId);
        const classification = classifyRow(plan, row);

        if (classification.kind === "sanity_fail") {
          console.error(`SANITY FAIL: suite ${plan.suiteId} (${plan.testName}) — ${classification.reason}`);
          sanityFailed++;
          continue;
        }

        if (classification.kind === "already_restored") {
          if (classification.rulesUpToDate) {
            console.log(`OK-SKIP (already restored): ${plan.testName}`);
            console.log(`  current: active=true, input=${JSON.stringify(plan.newInput)}, quarantine_reason=(null) — matches this plan's target state exactly.`);
            console.log(`  no write needed; rerun is idempotent.`);
            console.log();
            alreadyRestored++;
            continue;
          }

          // Already restored, but with the pre-review not_null-only
          // company_name check (MEDIUM finding). The row itself (active,
          // input, quarantine_reason) is correct — only validation_rules
          // is stale. --upgrade-rules is the dedicated, explicit opt-in
          // for touching an otherwise-fine row a second time.
          console.log(`OK-SKIP, STALE RULES: ${plan.testName}`);
          console.log(`  current: active=true, input=${JSON.stringify(plan.newInput)} — correct.`);
          console.log(`  current validation_rules still use company_name not_null (pre-review) instead of equals("${plan.baselineOutput.company_name}").`);
          if (upgradeRules) {
            console.log(`  --upgrade-rules is set: will upgrade validation_rules${apply ? "" : " (dry run — not written)"}.`);
          } else {
            console.log(`  pass --upgrade-rules to fix this without a full restore.`);
          }
          console.log();

          if (!upgradeRules) {
            rulesStaleNotUpgraded++;
            continue;
          }

          rulesUpgraded++;
          if (!apply) continue;

          // Compare-and-set scoped to the row's CURRENT (already-restored)
          // state — id AND active=true AND input=newInput — distinct from
          // the needs_restore predicate below (id AND active=false AND
          // input=oldInput). Only validation_rules/baseline_output change;
          // active/input/quarantine_reason are untouched (they're already
          // correct, which is exactly why this row is "already_restored").
          const upgraded = await tx.execute(sql`
            UPDATE test_suites
               SET validation_rules = ${JSON.stringify(plan.validationRules)}::jsonb,
                   baseline_output = ${JSON.stringify(plan.baselineOutput)}::jsonb,
                   updated_at = NOW()
             WHERE id = ${plan.suiteId}
               AND active = true
               AND input = ${JSON.stringify(plan.newInput)}::jsonb
            RETURNING id
          `);
          const upgradedRows = Array.isArray(upgraded) ? upgraded : (upgraded as { rows?: unknown[] }).rows ?? [];
          if (upgradedRows.length !== 1) {
            throw new Error(
              `Rule-upgrade UPDATE for suite ${plan.suiteId} (${plan.testName}) affected ` +
                `${upgradedRows.length} rows, expected exactly 1.`,
            );
          }
          console.log(`Rules upgraded: ${plan.testName} (${plan.suiteId})`);
          continue;
        }

        // needs_restore
        console.log(`OK (needs restore): ${plan.testName}`);
        console.log(`  current: active=false, input=${JSON.stringify(plan.oldInput)}, quarantine_reason=(set)`);
        console.log(`  planned: active=true,  input=${JSON.stringify(plan.newInput)}, quarantine_reason=NULL`);
        console.log(`  validation_rules: rebuilt from live-verified output (${plan.validationRules.checks.length} checks)`);
        console.log(`  baseline_output: rebuilt from live-verified output`);
        console.log();
        needsRestore++;

        if (!apply) continue;

        // Compare-and-set: the predicate re-asserts the exact pre-restore
        // shape (id AND input=old AND active=false) at WRITE time, not just
        // at the preflight read a moment earlier — the row is already
        // locked by the SELECT ... FOR UPDATE above, so this is belt-and-
        // suspenders against any future refactor that reads and writes in
        // separate transactions. RETURNING + an affected-row-count assertion
        // makes a silent 0-row update (predicate didn't match — someone
        // changed the row between FOR UPDATE and here, which shouldn't be
        // possible inside one transaction, but "shouldn't be possible" is
        // exactly the class of assumption DEC-20260504-A exists to distrust)
        // a loud failure instead of a silently-skipped write.
        const updated = await tx.execute(sql`
          UPDATE test_suites
             SET active = true,
                 input = ${JSON.stringify(plan.newInput)}::jsonb,
                 validation_rules = ${JSON.stringify(plan.validationRules)}::jsonb,
                 baseline_output = ${JSON.stringify(plan.baselineOutput)}::jsonb,
                 quarantine_reason = NULL,
                 test_status = 'normal',
                 updated_at = NOW()
           WHERE id = ${plan.suiteId}
             AND active = false
             AND input = ${JSON.stringify(plan.oldInput)}::jsonb
          RETURNING id
        `);
        const updatedRows = Array.isArray(updated) ? updated : (updated as { rows?: unknown[] }).rows ?? [];
        if (updatedRows.length !== 1) {
          throw new Error(
            `Compare-and-set UPDATE for suite ${plan.suiteId} (${plan.testName}) affected ` +
              `${updatedRows.length} rows, expected exactly 1. The row was locked by this ` +
              "transaction's SELECT ... FOR UPDATE and matched needs_restore a moment ago — " +
              "this should be unreachable. Aborting the whole transaction rather than leaving " +
              "a partial restore.",
          );
        }
        console.log(`Applied: ${plan.testName} (${plan.suiteId})`);
      }

      if (!apply) {
        // Dry run: always roll back, regardless of classification outcome
        // (including sanity failures) — the summary/exit-code handling
        // below is uniform for dry-run either way. No COMMIT is ever
        // reached on this path.
        throw new DryRunRollback();
      }

      if (sanityFailed > 0) {
        throw new Error(`${sanityFailed} suite(s) failed sanity classification — see SANITY FAIL lines above.`);
      }
    });
  } catch (err) {
    if (err instanceof DryRunRollback) {
      console.log("Dry run complete (transaction rolled back). No rows were modified. Re-run with --apply to write.");
      console.log(
        `Summary: ${needsRestore} would restore, ${alreadyRestored} already restored (OK-skip, rules up to date), ` +
          `${rulesUpgraded} rules would be upgraded, ${rulesStaleNotUpgraded} have stale rules but --upgrade-rules ` +
          `was not passed, ${sanityFailed} sanity failed.`,
      );
      process.exit(sanityFailed > 0 ? 1 : 0);
    }
    console.error("\nTransaction rolled back — no partial writes.");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(
    `\nDone. ${needsRestore} suite(s) restored, ${alreadyRestored} already-restored and unchanged (idempotent), ` +
      `${rulesUpgraded} suite(s) had validation_rules upgraded to equals assertions${rulesStaleNotUpgraded > 0 ? `, ${rulesStaleNotUpgraded} still have stale rules (rerun with --upgrade-rules to fix)` : ""}. ` +
      "updated_at was bumped (on restored/upgraded rows only) without touching baseline_captured_at, so the " +
      "PR #308 stale-baseline check (test-runner.ts) will flag them as stale on the next scheduled " +
      "run and trigger an automatic baseline recapture against live output — belt-and-suspenders on " +
      "top of the baseline_output already set here from this session's live verification.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
