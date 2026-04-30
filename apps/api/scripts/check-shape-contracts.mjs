#!/usr/bin/env node
/**
 * Cert-audit Layer 2 (generalised 2026-04-30): type-shape contract
 * checks across multiple cross-repo interfaces.
 *
 * Predecessor: check-audit-record-shape.mjs handled ONE pair
 * (AuditRecord). This generalises to a list of contracts so additional
 * shared types (TrustSummary, etc.) can be registered without
 * copy-paste.
 *
 * USE THIS PATTERN ONLY FOR INTERFACES DECLARED ON BOTH SIDES with
 * the SAME NAME and SAME field names. AuditRecord matches that
 * pattern: both repos export `interface AuditRecord` with identical
 * field names.
 *
 * DO NOT use this pattern for "wire shape ↔ consumer shape" cases
 * where the backend serializer emits one set of names
 * (`fallback_capability`, `fallback_price_cents`) and the frontend
 * normalizer maps them to different names (`capability_slug`,
 * `price_cents`). For those, write a contract test (a vitest test
 * that runs a frozen fixture through the normalizer and asserts the
 * output) — see strale-frontend/src/lib/api.contract.test.ts. The
 * shape-check would always fail on those because the names are
 * different by design.
 *
 * Two modes:
 *   default  — check all contracts, exit 0 clean / 1 on any divergence
 *   --list   — print the registered contracts and exit 0
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const frontendRoot = process.env.STRALE_FRONTEND_PATH
  ? resolve(process.env.STRALE_FRONTEND_PATH)
  : resolve("c:/Users/pette/Projects/strale-frontend");

// ─── Contract registry ─────────────────────────────────────────────────────
//
// Add an entry for any interface that:
//   (a) Is declared in both repos with the same interface name
//   (b) Should have the same field names + types in both
//
// The script will diff the field-set; CI fails on any divergence.

const CONTRACTS = [
  {
    name: "AuditRecord",
    backendFile: resolve(repoRoot, "apps/api/src/routes/audit.ts"),
    frontendFile: resolve(frontendRoot, "src/lib/compliance-types.ts"),
    rationale:
      "/v1/audit/:id response shape. Backend builder: composeAuditRecord. Frontend consumer: AuditRecord page + generate-audit-pdf.",
  },
  // Future entries land here. Examples that may apply when the
  // corresponding wire shapes get typed interfaces:
  //   - ExecutionGuidanceWireShape (currently inline ad-hoc in
  //     internal-trust.ts; needs a typed interface before adding here)
  //   - TrustSummaryWireShape (same)
  //   - PlatformFacts (already shared via a single source: backend
  //     STATIC_FACTS + computePlatformFacts; frontend imports from
  //     /v1/platform/facts via usePlatformFacts hook. No
  //     drift-by-construction; no shape-check needed.)
];

if (process.argv.includes("--list")) {
  console.log(`Registered shape contracts (${CONTRACTS.length}):`);
  for (const c of CONTRACTS) {
    console.log(`  - ${c.name}`);
    console.log(`      backend:  ${c.backendFile}`);
    console.log(`      frontend: ${c.frontendFile}`);
    console.log(`      ${c.rationale}`);
  }
  process.exit(0);
}

if (!existsSync(frontendRoot)) {
  console.log(`Skipping shape-contract check: frontend repo not present at ${frontendRoot}`);
  console.log("  (Set STRALE_FRONTEND_PATH or run from a checkout with both repos.)");
  process.exit(0);
}

// ─── Interface extraction + parsing ────────────────────────────────────────

function extractInterface(source, name) {
  const re = new RegExp(`(?:export\\s+)?interface\\s+${name}\\s*\\{`, "m");
  const m = source.match(re);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  if (depth !== 0) return null;
  return source.slice(start, i - 1);
}

function parseFields(body) {
  if (body == null) return null;
  const stripped = body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, (_, pre) => pre);

  const fields = new Map();
  let depth = 0;
  let buf = "";
  const statements = [];
  for (const ch of stripped) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (ch === ";" && depth === 0) {
      const s = buf.trim();
      if (s) statements.push(s);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) statements.push(buf.trim());

  for (const stmt of statements) {
    const m = stmt.match(/^([A-Za-z_][A-Za-z0-9_]*)(\?)?:\s*([\s\S]+)$/);
    if (!m) continue;
    const name = m[1];
    const optional = !!m[2];
    const type = m[3].trim().replace(/\s+/g, " ");
    fields.set(name, optional ? `${type} | undefined` : type);
  }
  return fields;
}

// ─── Per-contract diff ─────────────────────────────────────────────────────

function checkContract(c) {
  const backendSrc = readFileSync(c.backendFile, "utf8");
  const frontendSrc = readFileSync(c.frontendFile, "utf8");
  const backendBody = extractInterface(backendSrc, c.name);
  const frontendBody = extractInterface(frontendSrc, c.name);

  if (!backendBody || !frontendBody) {
    return {
      contract: c.name,
      ok: false,
      summary: `Failed to locate \`interface ${c.name}\` in one of the files: backend=${backendBody ? "found" : "NOT FOUND"}, frontend=${frontendBody ? "found" : "NOT FOUND"}`,
      missingInFrontend: [],
      missingInBackend: [],
      typeMismatch: [],
    };
  }

  const backendFields = parseFields(backendBody);
  const frontendFields = parseFields(frontendBody);

  const missingInFrontend = [];
  const missingInBackend = [];
  const typeMismatch = [];

  for (const [name, type] of backendFields) {
    if (!frontendFields.has(name)) missingInFrontend.push({ name, type });
    else if (frontendFields.get(name) !== type) typeMismatch.push({ name, backend: type, frontend: frontendFields.get(name) });
  }
  for (const [name, type] of frontendFields) {
    if (!backendFields.has(name)) missingInBackend.push({ name, type });
  }

  const total = missingInFrontend.length + missingInBackend.length + typeMismatch.length;
  return {
    contract: c.name,
    ok: total === 0,
    summary: total === 0
      ? `${c.name}: backend=${backendFields.size} fields, frontend=${frontendFields.size} fields, ✓ match`
      : `${c.name}: ${total} divergence(s)`,
    missingInFrontend,
    missingInBackend,
    typeMismatch,
  };
}

// ─── Run + report ──────────────────────────────────────────────────────────

let anyFailed = false;
for (const c of CONTRACTS) {
  const r = checkContract(c);
  console.log(r.summary);
  if (!r.ok) {
    anyFailed = true;
    if (r.missingInFrontend.length > 0) {
      console.log(`  Backend ships, frontend doesn't declare (frontend silently drops):`);
      for (const f of r.missingInFrontend) console.log(`    ${f.name}: ${f.type}`);
    }
    if (r.missingInBackend.length > 0) {
      console.log(`  Frontend declares, backend doesn't ship (frontend reads undefined):`);
      for (const f of r.missingInBackend) console.log(`    ${f.name}: ${f.type}`);
    }
    if (r.typeMismatch.length > 0) {
      console.log(`  Type mismatches (same name, different shape):`);
      for (const f of r.typeMismatch) {
        console.log(`    ${f.name}`);
        console.log(`      backend:  ${f.backend}`);
        console.log(`      frontend: ${f.frontend}`);
      }
    }
  }
}

if (anyFailed) {
  console.error("\nUpdate the diverging side(s) so both repos agree on the interface shape.");
  console.error("Both repos commit the type definition; this script enforces they agree.");
  process.exit(1);
}

console.log("\n✓ All shape contracts clean.");
process.exit(0);
