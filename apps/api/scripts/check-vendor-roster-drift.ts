#!/usr/bin/env node
/**
 * Vendor register drift check (M4 batch 6).
 *
 * Retargeted off Notion. Before this batch, this script's primary check
 * compared the Notion Vendor Roster against the Notion Decisions DB (a
 * vendor row whose "Last evaluated" date was older than a Decision that
 * touched it), and a secondary, report-only "shadow" section compared the
 * Notion Vendor Roster against the repo-owned `config/vendors.yaml`
 * register. Both legs read NOTION_TOKEN and called api.notion.com.
 *
 * The repository's own vendor register is now the primary source: there is
 * no Notion Vendor Roster left to compare against, so the check this script
 * performs is the register's own self-consistency and cross-surface
 * contract -- the same contract `npm run vendors:check`
 * (scripts/check-vendors.mjs) enforces on every PR via `checkAllVendors` in
 * scripts/vendors-lib.mjs: schema validity, id/alias uniqueness, lifecycle
 * ordering, decision/evidence path resolution, and cross-checks against
 * apps/api/src/lib/dependency-manifest.ts PROVIDERS, apps/api/coverage-matrix/*.yaml,
 * config/env-manifest.yaml, and apps/api/src/lib/platform-facts.ts
 * (STALE_VENDORS, STATIC_FACTS.vendors), plus history against the base
 * branch. Running it again here, on a schedule, is deliberate: it is the
 * one drift signal that is otherwise checked only when a PR happens to
 * touch these files, and this weekly run confirms `main` itself, not just
 * the branch that last touched it, still satisfies the contract (a direct
 * push, an admin merge override, or history divergence on a shared checkout
 * would each escape a PR-only gate).
 *
 * Exit code is meaningful: 0 when `checkAllVendors` and `checkVendorViewFresh`
 * report zero findings, 1 when either reports at least one finding (real
 * drift -- the register, or the generated view of it, has drifted from what
 * the code surfaces or the base branch's history says), 2 on an unexpected
 * error (the register or a cross-checked file could not be read/parsed).
 * There is no more silent "always exits 0" mode: with Notion out of the
 * loop this check depends only on the committed tree, so it is exactly as
 * reliable as `vendors:check` and warrants the same exit-code discipline.
 *
 * Run modes
 * ─────────
 *
 * No flags. The check always runs and the exit code is always meaningful:
 * 0 clean, 1 drift, 2 error. The prior `--strict`/`--check` distinction
 * existed to keep a Notion API hiccup from failing a cron job; that
 * distinction is gone along with the Notion call it protected against,
 * since this check now depends only on the committed tree, same as
 * `vendors:check`.
 *
 * Removed in this batch: the Notion API call, the NOTION_TOKEN read, the
 * printed manual Notion procedure (--doc), and --roster-fixture (it fed a
 * synthetic Notion-shaped roster into the now-removed shadow comparison;
 * there is no roster left to fixture). See
 * docs/strategy/2026-09-10-m3-vendor-state-model.md for the register's
 * design and archive/sessions/2026-09-11-m4-cutover-inventory.md section 7
 * item 6 for this batch's specification.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAllVendors, checkVendorViewFresh, REGISTER_PATH } from "../../../scripts/vendors-lib.mjs";

// This file is apps/api/scripts/check-vendor-roster-drift.ts; the repository
// root is three levels up (scripts -> api -> apps -> root). Resolved from
// the script's own location, never from process.cwd(), because
// weekly-drift.yml's step runs this with
// `cd apps/api && npx tsx scripts/check-vendor-roster-drift.ts`, so cwd is
// apps/api, not the repository root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function runCheck(): Promise<number> {
  const { findings, warnings, vendorCount } = checkAllVendors(REPO_ROOT);
  findings.push(...checkVendorViewFresh(REPO_ROOT));

  for (const w of warnings) {
    console.log(`  warn ${w.code} ${w.file}: ${w.detail}`);
  }

  if (findings.length === 0) {
    console.log(`No drift detected. ${vendorCount} vendor(s) in ${REGISTER_PATH} checked against schema, history, and cross-surface references.`);
    return 0;
  }

  console.log(`${findings.length} drift finding(s) in ${REGISTER_PATH}:\n`);
  for (const f of findings) {
    console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
  console.log(`\nRecommended action: run npm run vendors:check locally, resolve each finding, and re-run.`);
  return 1;
}

runCheck().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  },
);
