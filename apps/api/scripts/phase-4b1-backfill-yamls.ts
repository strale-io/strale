/**
 * Phase 4b.1 — YAML backfill for required-field gaps.
 *
 * For each manifest in `manifests/*.yaml`, reads the corresponding DB row and
 * injects any missing required fields. Source of truth: DB (Strategy A from
 * the Phase 4b audit, `audit-reports/2026-04-20-phase-4b-audit.md`).
 *
 * Fields injected when absent from YAML (DB value → YAML):
 *   - maintenance_class           (manifest-canonical, 242 YAMLs missing)
 *   - processes_personal_data     (manifest-canonical, 260 YAMLs missing)
 *   - personal_data_categories    (manifest-canonical, conditional when ppd=true)
 *   - geography                   (hybrid, 275 YAMLs missing, 269 DB populated)
 *
 * Strategy:
 *   - Line-based text insertion at a deterministic anchor (`^test_fixtures:`
 *     at column 0, present in all 275 YAMLs). Preserves comments, ordering,
 *     formatting of everything else in the file.
 *   - Never overwrites an existing field value. If YAML already declares
 *     `maintenance_class: X` and DB has `Y`, we leave YAML as X and log a
 *     drift warning. 4a `checkAuthorityDrift` handles runtime drift separately.
 *
 * Modes:
 *   --dry-run   Reports what would change, writes no files.
 *   (default)   Writes missing fields to each affected YAML in place.
 *
 * Report written to:
 *   audit-reports/2026-04-20-phase-4b1-yaml-backfill-dryrun.md  (--dry-run)
 *   audit-reports/2026-04-20-phase-4b1-yaml-backfill.md         (real run)
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import yaml from "js-yaml";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";

type Plan = {
  slug: string;
  file: string;
  current: Record<string, unknown>;
  missing: string[];
  inserts: Array<{ field: string; value: unknown; lines: string[] }>;
  skipped: Array<{ field: string; reason: string }>;
  drift: Array<{ field: string; yaml: unknown; db: unknown }>;
  anchorLine: number;
};

const MANIFEST_DIR = resolve(import.meta.dirname, "../../../manifests");

function anchorIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("test_fixtures:")) return i;
  }
  return -1;
}

function indent(s: string, n = 2): string {
  return " ".repeat(n) + s;
}

/**
 * Render a field value as YAML lines. Matches the hand-authored style of
 * email-validate.yaml: scalar values inline, arrays as block with `  - item`.
 */
function renderFieldLines(field: string, value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "boolean" || typeof value === "number") {
    return [`${field}: ${value}`];
  }
  if (typeof value === "string") {
    // Plain scalar — only quote if value contains chars that break YAML.
    const unsafe = /[:#&*!|>'"%@`,{}\[\]]/.test(value) || /^\s|\s$/.test(value);
    return [`${field}: ${unsafe ? JSON.stringify(value) : value}`];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${field}: []`];
    const out = [`${field}:`];
    for (const v of value) {
      if (typeof v === "string") {
        const unsafe = /[:#&*!|>'"%@`,{}\[\]]/.test(v) || /^\s|\s$/.test(v);
        out.push(indent(`- ${unsafe ? JSON.stringify(v) : v}`));
      } else {
        out.push(indent(`- ${JSON.stringify(v)}`));
      }
    }
    return out;
  }
  // Objects: fallback to inline JSON (shouldn't happen for our 4 fields)
  return [`${field}: ${JSON.stringify(value)}`];
}

function buildPlan(
  slug: string,
  file: string,
  yamlText: string,
  dbRow: {
    maintenanceClass: string | null;
    processesPersonalData: boolean | null;
    personalDataCategories: string[] | null;
    geography: string | null;
  },
): Plan {
  const parsed = yaml.load(yamlText) as Record<string, unknown>;
  const lines = yamlText.split("\n");
  const plan: Plan = {
    slug,
    file,
    current: parsed,
    missing: [],
    inserts: [],
    skipped: [],
    drift: [],
    anchorLine: anchorIndex(lines),
  };

  // maintenance_class — manifest-canonical, always inject if DB has value
  if (parsed.maintenance_class === undefined) {
    if (dbRow.maintenanceClass) {
      plan.missing.push("maintenance_class");
      plan.inserts.push({
        field: "maintenance_class",
        value: dbRow.maintenanceClass,
        lines: renderFieldLines("maintenance_class", dbRow.maintenanceClass),
      });
    } else {
      plan.skipped.push({ field: "maintenance_class", reason: "DB value is NULL" });
    }
  } else if (
    dbRow.maintenanceClass &&
    parsed.maintenance_class !== dbRow.maintenanceClass
  ) {
    plan.drift.push({
      field: "maintenance_class",
      yaml: parsed.maintenance_class,
      db: dbRow.maintenanceClass,
    });
  }

  // processes_personal_data — manifest-canonical, always inject
  if (parsed.processes_personal_data === undefined) {
    if (dbRow.processesPersonalData !== null) {
      plan.missing.push("processes_personal_data");
      const out = [
        "# SA.2b: per-capability PII classification (F-A-003, F-A-009)",
        `processes_personal_data: ${dbRow.processesPersonalData}`,
      ];
      plan.inserts.push({
        field: "processes_personal_data",
        value: dbRow.processesPersonalData,
        lines: out,
      });
    } else {
      plan.skipped.push({ field: "processes_personal_data", reason: "DB value is NULL" });
    }
  } else if (
    dbRow.processesPersonalData !== null &&
    parsed.processes_personal_data !== dbRow.processesPersonalData
  ) {
    plan.drift.push({
      field: "processes_personal_data",
      yaml: parsed.processes_personal_data,
      db: dbRow.processesPersonalData,
    });
  }

  // personal_data_categories — conditional. Inject when DB non-empty AND YAML absent.
  if (parsed.personal_data_categories === undefined) {
    const cats = dbRow.personalDataCategories ?? [];
    if (cats.length > 0) {
      plan.missing.push("personal_data_categories");
      plan.inserts.push({
        field: "personal_data_categories",
        value: cats,
        lines: renderFieldLines("personal_data_categories", cats),
      });
    }
    // If DB is empty AND ppd=false, we omit (optional). Audit §4.4 preference.
  } else {
    // YAML declares; check drift
    const yamlCats = Array.isArray(parsed.personal_data_categories)
      ? (parsed.personal_data_categories as string[])
      : [];
    const dbCats = [...(dbRow.personalDataCategories ?? [])].sort();
    const yamlSorted = [...yamlCats].sort();
    if (JSON.stringify(yamlSorted) !== JSON.stringify(dbCats)) {
      plan.drift.push({
        field: "personal_data_categories",
        yaml: yamlCats,
        db: dbRow.personalDataCategories,
      });
    }
  }

  // geography — hybrid. Inject when DB has value AND YAML absent.
  if (parsed.geography === undefined) {
    if (dbRow.geography) {
      plan.missing.push("geography");
      plan.inserts.push({
        field: "geography",
        value: dbRow.geography,
        lines: renderFieldLines("geography", dbRow.geography),
      });
    } else {
      plan.skipped.push({ field: "geography", reason: "DB geography IS NULL (CZ cluster)" });
    }
  } else if (
    dbRow.geography &&
    parsed.geography !== dbRow.geography
  ) {
    plan.drift.push({
      field: "geography",
      yaml: parsed.geography,
      db: dbRow.geography,
    });
  }

  return plan;
}

function applyPlan(yamlText: string, plan: Plan): string {
  if (plan.inserts.length === 0) return yamlText;
  const lines = yamlText.split("\n");
  const anchor = plan.anchorLine;
  if (anchor < 0) {
    throw new Error(
      `${plan.slug}: no test_fixtures: anchor found — cannot inject safely`,
    );
  }

  // Build insertion block: all missing fields in stable order, then a blank
  // line before test_fixtures: only if the previous line wasn't already blank.
  const insertBlock: string[] = [];
  for (const ins of plan.inserts) {
    insertBlock.push(...ins.lines);
  }

  // Keep a blank line between the inserted block and test_fixtures for
  // readability — but only if we're not already surrounded by blanks.
  const prev = anchor - 1;
  const prevIsBlank = prev >= 0 && lines[prev].trim() === "";

  if (!prevIsBlank) {
    // Insert block at anchor; everything after stays put
    lines.splice(anchor, 0, ...insertBlock);
  } else {
    // Insert just before the blank line so the blank separator is preserved
    lines.splice(prev, 0, ...insertBlock);
  }

  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const db = getDb();
  const rows = await db
    .select({
      slug: capabilities.slug,
      maintenanceClass: capabilities.maintenanceClass,
      processesPersonalData: capabilities.processesPersonalData,
      personalDataCategories: capabilities.personalDataCategories,
      geography: capabilities.geography,
    })
    .from(capabilities);

  const dbBySlug = new Map(rows.map((r) => [r.slug, r]));

  const yamlFiles = readdirSync(MANIFEST_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .sort();

  const plans: Plan[] = [];
  const noDbMatch: string[] = [];

  for (const f of yamlFiles) {
    const slug = f.replace(/\.yaml$/, "");
    const file = resolve(MANIFEST_DIR, f);
    const text = readFileSync(file, "utf8");
    const dbRow = dbBySlug.get(slug);
    if (!dbRow) {
      noDbMatch.push(slug);
      continue;
    }
    const plan = buildPlan(slug, file, text, dbRow);
    plans.push(plan);
  }

  const touched = plans.filter((p) => p.inserts.length > 0);
  const skipped = plans.filter((p) => p.inserts.length === 0);
  const hasDrift = plans.filter((p) => p.drift.length > 0);
  const hasSkip = plans.filter((p) => p.skipped.length > 0);

  // Stats by field
  const perField: Record<string, number> = {};
  for (const p of touched) {
    for (const ins of p.inserts) {
      perField[ins.field] = (perField[ins.field] ?? 0) + 1;
    }
  }

  // Write report
  const reportPath = resolve(
    import.meta.dirname,
    "../../..",
    "audit-reports",
    dryRun
      ? "2026-04-20-phase-4b1-yaml-backfill-dryrun.md"
      : "2026-04-20-phase-4b1-yaml-backfill.md",
  );

  const report: string[] = [];
  report.push(`# Phase 4b.1 YAML backfill — ${dryRun ? "DRY RUN" : "applied"}`);
  report.push("");
  report.push(`**Generated:** ${new Date().toISOString()}`);
  report.push(`**Mode:** ${dryRun ? "dry-run (no writes)" : "writes applied"}`);
  report.push("");
  report.push("## Summary");
  report.push("");
  report.push(`- YAML files scanned: **${plans.length}**`);
  report.push(`- Files to modify: **${touched.length}**`);
  report.push(`- Files already complete: **${skipped.length}**`);
  report.push(`- Files with drift (YAML ≠ DB, preserved YAML): **${hasDrift.length}**`);
  report.push(`- Files with skip (DB value NULL): **${hasSkip.length}**`);
  report.push(`- YAML files with no DB match: **${noDbMatch.length}**`);
  report.push("");
  report.push("### Fields added, by field");
  report.push("");
  report.push("| Field | Count |");
  report.push("|---|---|");
  for (const [k, v] of Object.entries(perField).sort((a, b) => b[1] - a[1])) {
    report.push(`| ${k} | ${v} |`);
  }
  report.push("");

  if (noDbMatch.length > 0) {
    report.push("## YAML without DB row (skipped)");
    report.push("");
    for (const s of noDbMatch) report.push(`- ${s}`);
    report.push("");
  }

  if (hasDrift.length > 0) {
    report.push("## Drift cases (YAML preserved; 4a checkAuthorityDrift handles at runtime)");
    report.push("");
    report.push("| Slug | Field | YAML | DB |");
    report.push("|---|---|---|---|");
    for (const p of hasDrift) {
      for (const d of p.drift) {
        report.push(
          `| ${p.slug} | ${d.field} | \`${JSON.stringify(d.yaml)}\` | \`${JSON.stringify(d.db)}\` |`,
        );
      }
    }
    report.push("");
  }

  if (hasSkip.length > 0) {
    report.push("## Skipped injections (DB NULL)");
    report.push("");
    report.push("| Slug | Field | Reason |");
    report.push("|---|---|---|");
    for (const p of hasSkip) {
      for (const s of p.skipped) {
        report.push(`| ${p.slug} | ${s.field} | ${s.reason} |`);
      }
    }
    report.push("");
  }

  report.push("## Per-slug diffs");
  report.push("");
  for (const p of touched.sort((a, b) => a.slug.localeCompare(b.slug))) {
    report.push(`### ${p.slug}`);
    report.push("");
    report.push(`Added: ${p.missing.join(", ")}`);
    report.push("");
    report.push("```yaml");
    for (const ins of p.inserts) {
      for (const line of ins.lines) report.push(line);
    }
    report.push("```");
    report.push("");
  }

  writeFileSync(reportPath, report.join("\n"), "utf8");
  console.log(`Report written: ${reportPath}`);

  // Apply writes if not dry-run
  if (!dryRun) {
    let written = 0;
    for (const p of touched) {
      const original = readFileSync(p.file, "utf8");
      const next = applyPlan(original, p);
      writeFileSync(p.file, next, "utf8");
      written++;
    }
    console.log(`Wrote ${written} files`);
  }

  console.log("");
  console.log(`Touched: ${touched.length}, Skipped (already complete): ${skipped.length}`);
  console.log(`Drift: ${hasDrift.length}, Skip (DB NULL): ${hasSkip.length}, No DB: ${noDbMatch.length}`);
  console.log(`Per-field:`, perField);

  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
