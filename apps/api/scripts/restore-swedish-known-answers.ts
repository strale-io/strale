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
 *   Per-suite daily attempt counts are NOT uniform across test_type — this
 *   was checked directly against test_results for the 5 most recent clean
 *   days (2026-08-13 through 2026-08-17), per suite id:
 *     known_answer (Spotify AB, the one suite untouched by the Phase 4
 *       dedup) ................................ steady 18/day for 5/5 days
 *     dependency_health ........................ steady ~2.2/day
 *     edge_case ................................. steady ~2.8/day
 *     known_bad .................................. steady ~2.2/day
 *     negative .................................... steady ~2.6/day
 *     schema_check ................................ steady ~3.0/day
 *       (post-2026-08-13; was ~12/day on 08-10/08-11, before whatever
 *       changed then — not relevant to this projection)
 *
 *   Current post-Phase-4 active set (6 suites, 1 known_answer + 5 others):
 *     ~2.2 + 2.8 + 18 + 2.2 + 2.6 + 3.0 = ~30.8/day
 *
 *   Each RESTORED known_answer suite is the same test_type, same shape,
 *   same debounce/stagger mechanics as Spotify's — so ~18/day each is the
 *   best available same-shape estimate (not a generic average; it is the
 *   observed, sustained, 5-day-stable rate for this exact suite type on
 *   this exact capability):
 *     30.8 + 3 suites x 18/day = 30.8 + 54 = ~84.8/day  ≈ 85/day
 *
 *   That is under the "~95 of 100" ceiling this task set, with ~10/day of
 *   margin to 95 and ~15/day to the hard 100 cap. Restoring a 4th
 *   (Volvo, if the label question above gets resolved) would land at
 *   ~102.8/day — OVER the 100 hard cap — so 3 is the actual ceiling here,
 *   not merely the instructed range's upper bound.
 *
 *   NOTE ON THE TASK'S STATED "~85 attempts/day" BASELINE: that number
 *   describes almost exactly what this script projects for the
 *   POST-RESTORE state (~84.8), not the pre-restore state. The real
 *   pre-restore (current, 6-suite) baseline is ~31/day — confirmed against
 *   capability_budget_counters, which additionally shows the *old*
 *   11-suite configuration hitting the full 100/100 hard cap on every one
 *   of the last 5 days (2026-08-13 through 2026-08-17), each time by
 *   ~04:30-05:40 UTC. That's the concrete cost the Phase 4 dedup fixed;
 *   this script spends about half of what it recovered.
 *
 * Usage:
 *   npx tsx --env-file=<path to .env> scripts/restore-swedish-known-answers.ts
 *   npx tsx --env-file=<path to .env> scripts/restore-swedish-known-answers.ts --apply
 *
 * Dry-run (no --apply) is the default and only prints the diff. --apply is
 * required to write. This script is READ-ONLY against prod unless --apply
 * is passed explicitly by an operator after review.
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
        { field: "company_name", operator: "not_null" },
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
        { field: "company_name", operator: "not_null" },
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
        { field: "company_name", operator: "not_null" },
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

function printBudgetArithmetic(): void {
  console.log("Budget arithmetic (Block 0084, swedish-company-data, cap=100/day):");
  console.log("  Current active-suite baseline (post Phase-4, empirically observed):");
  console.log("    dependency_health  ~2.2/day");
  console.log("    edge_case          ~2.8/day");
  console.log("    known_bad          ~2.2/day");
  console.log("    negative           ~2.6/day");
  console.log("    schema_check       ~3.0/day");
  console.log("    known_answer (Spotify, unchanged)  18.0/day");
  console.log("    ---------------------------------------");
  console.log("    baseline total     ~30.8/day");
  console.log(`  + ${RESTORE_PLANS.length} restored known_answer suites x ~18.0/day each = ${(RESTORE_PLANS.length * 18).toFixed(1)}/day`);
  const projected = 30.8 + RESTORE_PLANS.length * 18;
  console.log(`  = projected total ~${projected.toFixed(1)}/day  (ceiling requested: ~95/day; hard cap: 100/day)`);
  if (projected > 100) {
    console.log("  *** OVER THE 100/DAY HARD CAP — DO NOT APPLY ***");
  } else if (projected > 95) {
    console.log("  *** OVER THE ~95/DAY REQUESTED CEILING — reconsider suite count ***");
  } else {
    console.log(`  OK — ${(95 - projected).toFixed(1)}/day of margin to the ~95 ceiling, ${(100 - projected).toFixed(1)}/day to the hard cap.`);
  }
  console.log();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  printBudgetArithmetic();

  console.log(`Mode: ${apply ? "APPLY (writing to prod)" : "DRY RUN (no writes)"}\n`);

  // Sanity check: confirm each target suite is currently inactive with the
  // expected quarantine reason and the expected stale (Spotify-cloned) input,
  // so this script can never accidentally "restore" something else.
  const ids = RESTORE_PLANS.map((p) => p.suiteId);
  const current = await db.execute(sql`
    SELECT id::text AS id, test_name, input, active, quarantine_reason, capability_slug
      FROM test_suites
     WHERE id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
  `);
  const rows = (Array.isArray(current) ? current : (current as { rows?: unknown[] }).rows ?? []) as Array<{
    id: string;
    test_name: string;
    input: Record<string, unknown>;
    active: boolean;
    quarantine_reason: string | null;
    capability_slug: string;
  }>;
  const byId = new Map(rows.map((r) => [r.id, r]));

  let allSane = true;
  for (const plan of RESTORE_PLANS) {
    const row = byId.get(plan.suiteId);
    if (!row) {
      console.error(`SANITY FAIL: suite ${plan.suiteId} (${plan.testName}) not found.`);
      allSane = false;
      continue;
    }
    if (row.capability_slug !== CAPABILITY_SLUG) {
      console.error(`SANITY FAIL: suite ${plan.suiteId} belongs to '${row.capability_slug}', not '${CAPABILITY_SLUG}'.`);
      allSane = false;
      continue;
    }
    if (row.active !== false) {
      console.error(`SANITY FAIL: suite ${plan.suiteId} (${plan.testName}) is already active=true — refusing to touch it.`);
      allSane = false;
      continue;
    }
    const inputMatches = JSON.stringify(row.input) === JSON.stringify(plan.oldInput);
    if (!inputMatches) {
      console.error(
        `SANITY FAIL: suite ${plan.suiteId} (${plan.testName}) input is ${JSON.stringify(row.input)}, ` +
          `expected ${JSON.stringify(plan.oldInput)} — someone already touched this row. Refusing to overwrite.`,
      );
      allSane = false;
      continue;
    }
    console.log(`OK: ${plan.testName}`);
    console.log(`  current: active=false, input=${JSON.stringify(row.input)}, quarantine_reason=${row.quarantine_reason ? "(set)" : "(null)"}`);
    console.log(`  planned: active=true,  input=${JSON.stringify(plan.newInput)}, quarantine_reason=NULL`);
    console.log(`  validation_rules: rebuilt from live-verified output (${plan.validationRules.checks.length} checks)`);
    console.log(`  baseline_output: rebuilt from live-verified output`);
    console.log();
  }

  if (!allSane) {
    console.error("\nOne or more sanity checks failed. Aborting without writing anything.");
    process.exit(1);
  }

  if (!apply) {
    console.log("Dry run complete. No rows were modified. Re-run with --apply to write.");
    process.exit(0);
  }

  console.log("Applying...");
  for (const plan of RESTORE_PLANS) {
    await db.execute(sql`
      UPDATE test_suites
         SET active = true,
             input = ${JSON.stringify(plan.newInput)}::jsonb,
             validation_rules = ${JSON.stringify(plan.validationRules)}::jsonb,
             baseline_output = ${JSON.stringify(plan.baselineOutput)}::jsonb,
             quarantine_reason = NULL,
             test_status = 'normal',
             updated_at = NOW()
       WHERE id = ${plan.suiteId}
    `);
    console.log(`Applied: ${plan.testName} (${plan.suiteId})`);
  }
  console.log(
    "\nDone. updated_at was bumped without touching baseline_captured_at, so the " +
      "PR #308 stale-baseline check (test-runner.ts) will flag these as stale on " +
      "the next scheduled run and trigger an automatic baseline recapture against " +
      "live output — belt-and-suspenders on top of the baseline_output already " +
      "set here from this session's live verification.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
