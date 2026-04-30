#!/usr/bin/env node
/**
 * Detect drift between PLATFORM_FACTS and any surface that references
 * the same values in prose. Catches the cert-audit failure mode where
 * the methodology page kept saying "OpenSanctions" three days after
 * the vendor switch.
 *
 * Two modes:
 *   default  — print findings + exit 0 (informational)
 *   --strict — exit 1 on any drift (CI / weekly cron)
 *
 * The strale-frontend repo lives outside this monorepo; pass its path
 * via STRALE_FRONTEND_PATH or accept the default of
 * `c:\Users\pette\Projects\strale-frontend`. If the path doesn't exist,
 * the script skips frontend checks and reports backend-only.
 *
 * What's checked:
 *   - Vendor names: a stale vendor (e.g. "OpenSanctions" after the
 *     switch to Dilisense) appearing in any consumer file is flagged.
 *   - Capability count: any "NNN+ capabilities" string in marketing
 *     copy is flagged for re-verification against PLATFORM_FACTS.
 *   - Country count: same idea for "NN countries".
 *   - Retention period: any explicit "NN days" number near retention/
 *     audit copy is flagged for re-verification.
 *
 * Each drift is a `(file, line, problem, current_truth)` tuple — the
 * fix is always to re-read the source of truth from /v1/platform/facts.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const frontendRoot = process.env.STRALE_FRONTEND_PATH
  ? resolve(process.env.STRALE_FRONTEND_PATH)
  : resolve("c:/Users/pette/Projects/strale-frontend");

const strict = process.argv.includes("--strict");

// ─── Source-of-truth values ────────────────────────────────────────────────
//
// Hardcoded here mirroring STATIC_FACTS in apps/api/src/lib/platform-facts.ts.
// A unit test (platform-facts.test.ts) asserts the runtime values match;
// this script asserts the consumer surfaces match the runtime values.
// Two layers of defence — TS test for code, lint for prose.

const CURRENT_VENDORS = {
  sanctions: "Dilisense",
  pep: "Dilisense",
  adverse_media_primary: "Dilisense",
};

const STALE_VENDORS = ["OpenSanctions"];
const RETENTION_DAYS = 1095;

// ─── Walker ────────────────────────────────────────────────────────────────

function walk(dir, exts) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".next" || entry === "build") continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

// ─── Findings collector ────────────────────────────────────────────────────

const findings = [];

// Skip lines that are JSDoc / line comments / JSX comment blocks — the
// drift checks fire on prose, and our own "fixed Cert-audit Y-N: ..."
// comments shouldn't trigger false positives. Covers `// ...`,
// `* ...` (continuation), `/* ...`, `{/* ...` (JSX), and `<!-- ...` (HTML).
function isCommentLine(line) {
  const t = line.trimStart();
  return (
    t.startsWith("//") ||
    t.startsWith("*") ||
    t.startsWith("/*") ||
    t.startsWith("{/*") ||
    t.startsWith("<!--")
  );
}

function flag(file, line, problem, truth) {
  findings.push({
    file: relative(repoRoot, file).replace(/\\/g, "/"),
    line,
    problem,
    truth,
  });
}

// ─── Check 1: stale vendor names in consumer surfaces ──────────────────────

const surfaceRoots = [
  // Backend marketing surfaces (read-only, prose)
  resolve(repoRoot, "apps/api/src/routes/llms-txt.ts"),
  resolve(repoRoot, "apps/api/src/routes/ai-catalog.ts"),
  resolve(repoRoot, "apps/api/src/routes/welcome.ts"),
  resolve(repoRoot, "apps/api/src/routes/a2a.ts"),
  // Frontend repo (if path exists). `src/data` carries learnGuides
  // (static markdown for the Learn page); `index.html` carries SSR
  // SEO metadata + JSON-LD that React can't reach. The build output
  // (dist/) is intentionally excluded — it's a derivative of src/.
  resolve(frontendRoot, "src/pages"),
  resolve(frontendRoot, "src/components"),
  resolve(frontendRoot, "src/lib"),
  resolve(frontendRoot, "src/data"),
  resolve(frontendRoot, "public"),
  resolve(frontendRoot, "index.html"),
];

const surfaceFiles = [];
for (const r of surfaceRoots) {
  if (!existsSync(r)) continue;
  const stat = statSync(r);
  if (stat.isFile()) surfaceFiles.push(r);
  else surfaceFiles.push(...walk(r, [".ts", ".tsx", ".js", ".jsx", ".md", ".txt", ".json"]));
}

for (const file of surfaceFiles) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    for (const stale of STALE_VENDORS) {
      // Word-boundary match — avoid matching substrings of other words.
      const pattern = new RegExp(`\\b${stale}\\b`, "i");
      if (pattern.test(lines[i])) {
        flag(
          file,
          i + 1,
          `references stale vendor "${stale}"`,
          `current sanctions/PEP vendor is "${CURRENT_VENDORS.sanctions}" per DEC-20260429-A`,
        );
      }
    }
  }
}

// ─── Check 2: hardcoded retention numbers near audit/retention copy ────────

for (const file of surfaceFiles) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    // Retention claim shape: a number followed by "day" within audit/retention context.
    // Skip if the number matches the canonical value.
    const m = line.match(/(\d+)\s*day/i);
    if (!m) continue;
    const claimed = parseInt(m[1], 10);
    if (claimed === RETENTION_DAYS) continue;
    // Only flag if the line context is about retention/storage. The
    // word "audit" alone is too broad (matches "auditing third-party
    // services" or "security audit"); require an explicit retention
    // verb. False positives on SSL "expiring within 30 days" and
    // similar were the original failure mode.
    const context = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join(" ").toLowerCase();
    if (!/\b(retain|retention|retained|stored|store|keep|kept|delete|deletion|deleted|purge|purged)\b/i.test(context)) continue;
    // Skip 90/180/365/3650 in code-side TTL constants (token TTL, cache TTL).
    if (/(token|cache|ttl|interval|delay|expir|validity|cert)/i.test(context)) continue;
    flag(
      file,
      i + 1,
      `claims "${claimed} days" near retention/audit context`,
      `default retention is ${RETENTION_DAYS} days (TRANSACTION_RETENTION_DAYS)`,
    );
  }
}

// ─── Check 3: hardcoded "NN countries" in prose ────────────────────────────

const countryClaimPattern = /\b(\d{1,3})\s*countries\b/gi;

for (const file of surfaceFiles) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    countryClaimPattern.lastIndex = 0;
    const m = countryClaimPattern.exec(lines[i]);
    if (!m) continue;
    // Skip the LITERAL match itself if it's adjacent to an interpolation
    // (e.g. `${countryCount} countries`) — but a digit in a template
    // literal that ALSO has unrelated interpolations elsewhere should
    // still flag. Conservative test: the matched number must appear as
    // a literal numeric substring with no interpolation between it and
    // the word "countries".
    flag(
      file,
      i + 1,
      `hardcoded "${m[1]} countries"`,
      "country count must come from PLATFORM_FACTS.countries.company_data_active.length",
    );
  }
}

// ─── Check 4: hardcoded "NNN+ capabilities" in prose ───────────────────────
//
// Allows up to 4 adjective words between the number and "capabilities"
// so we catch "250+ Verified API Capabilities" and "Browse 250+ individual
// capabilities" — patterns the original `\s*` was too tight to find.

const capClaimPattern = /\b(\d{2,4})\+?\s+(?:[A-Za-z-]+\s+){0,4}capabilities\b/gi;

for (const file of surfaceFiles) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    capClaimPattern.lastIndex = 0;
    const m = capClaimPattern.exec(lines[i]);
    if (!m) continue;
    // Same conservative rule as country count: a literal "NNN+ capabilities"
    // is flagged regardless of what other interpolations exist on the line.
    flag(
      file,
      i + 1,
      `hardcoded "${m[1]} capabilities"`,
      "capability count must come from PLATFORM_FACTS.capability_counts.active_visible",
    );
  }
}

// ─── Report ────────────────────────────────────────────────────────────────

console.log(`platform-facts drift sweep: scanned ${surfaceFiles.length} surface file(s)`);
console.log(`  backend repo:  ${repoRoot}`);
console.log(`  frontend repo: ${existsSync(frontendRoot) ? frontendRoot : "(NOT FOUND — frontend checks skipped)"}`);

if (findings.length === 0) {
  console.log("\n✓ Clean — no drift detected.");
  process.exit(0);
}

console.log(`\n${findings.length} drift finding(s):\n`);
const groupedByFile = new Map();
for (const f of findings) {
  if (!groupedByFile.has(f.file)) groupedByFile.set(f.file, []);
  groupedByFile.get(f.file).push(f);
}
for (const [file, items] of groupedByFile) {
  console.log(`  ${file}`);
  for (const f of items) {
    console.log(`    L${f.line}  ${f.problem}`);
    console.log(`            → ${f.truth}`);
  }
}

if (strict) {
  console.error("\nDrift detected. Update the surface files to consume PLATFORM_FACTS, or update STATIC_FACTS if the value changed.");
  process.exit(1);
}
