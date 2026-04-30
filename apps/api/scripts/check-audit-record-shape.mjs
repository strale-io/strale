#!/usr/bin/env node
/**
 * Cert-audit Layer 2: type-shape contract between backend and frontend.
 *
 * The /v1/audit/:id endpoint serializes an `AuditRecord` interface
 * declared in apps/api/src/routes/audit.ts. The strale-frontend repo
 * has its own copy at src/lib/compliance-types.ts that drives the
 * audit-page UI. When the two diverge, we get bugs like:
 *   - frontend renders a field that the API stopped sending (TypeError
 *     at render)
 *   - API ships a new field; frontend silently drops it (RED-3
 *     fabrication class — the field exists but isn't displayed)
 *   - API renames a field; frontend keeps reading the old name and
 *     gets undefined (degrades to whatever fallback the component used)
 *
 * This script extracts the AuditRecord interface body from both files,
 * normalizes whitespace + comments + trailing semicolons, and diffs
 * the resulting field-set + field-types. CI-friendly: exit 0 on
 * matching shapes, exit 1 with a structured diff on divergence.
 *
 * What it does NOT check:
 *   - Field SEMANTICS (the field has the same meaning in both)
 *   - Field VALUES (the API actually populates the field)
 *   - Nested types referenced from AuditRecord (e.g. AuditStep) — the
 *     check is shallow on purpose; nested-type drift is rare and noisy.
 *     If it turns out to be a real issue, extend this to walk references.
 *
 * Why grep instead of TS compiler API: the compiler API requires
 * loading both repos' tsconfig + node_modules into one process.
 * Solo-founder simplicity wins here. The grep is robust to comments
 * and whitespace; if it ever produces a false positive we tighten it.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const frontendRoot = process.env.STRALE_FRONTEND_PATH
  ? resolve(process.env.STRALE_FRONTEND_PATH)
  : resolve("c:/Users/pette/Projects/strale-frontend");

const backendFile = resolve(repoRoot, "apps/api/src/routes/audit.ts");
const frontendFile = resolve(frontendRoot, "src/lib/compliance-types.ts");

if (!existsSync(frontendFile)) {
  console.log("Skipping audit-record shape check: frontend repo not present at " + frontendRoot);
  console.log("  (Set STRALE_FRONTEND_PATH or run from a checkout with both repos.)");
  process.exit(0);
}

/**
 * Extract the body of `interface AuditRecord { ... }` from a TS source.
 * Returns the raw text between the outer braces (still containing
 * comments + whitespace) so the caller can normalize.
 */
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

/**
 * Parse the field name + type literal from each top-level statement
 * in the interface body. Returns a Map<fieldName, normalizedType>.
 *
 * Handles:
 *   - leading comments (// and / * ... * /) — stripped
 *   - optional fields (`field?: type`) — recorded as `type | undefined`
 *     so the diff treats them differently from required-but-nullable
 *   - multi-line type literals (e.g. `quality: { sqs: number | null; ... }`)
 *     — collapsed onto one line and normalized
 *   - nested type references — kept as the literal type reference
 *     (e.g. `AuditStep[]` stays as `AuditStep[]`)
 */
function parseFields(body) {
  if (body == null) return null;
  // Strip block comments + line comments
  const stripped = body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, (_, pre) => pre);

  const fields = new Map();
  // Tokenise into top-level statements separated by `;` at depth 0.
  // Track brace depth so nested types (e.g. `quality: { sqs: ... }`)
  // are kept whole.
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
  // Trailing statement without semicolon
  if (buf.trim()) statements.push(buf.trim());

  for (const stmt of statements) {
    // Field shape: <name>(?)?: <type>
    const m = stmt.match(/^([A-Za-z_][A-Za-z0-9_]*)(\?)?:\s*([\s\S]+)$/);
    if (!m) continue;
    const name = m[1];
    const optional = !!m[2];
    // Normalize type whitespace
    const type = m[3].trim().replace(/\s+/g, " ");
    fields.set(name, optional ? `${type} | undefined` : type);
  }
  return fields;
}

const backendSrc = readFileSync(backendFile, "utf8");
const frontendSrc = readFileSync(frontendFile, "utf8");

const backendBody = extractInterface(backendSrc, "AuditRecord");
const frontendBody = extractInterface(frontendSrc, "AuditRecord");

if (!backendBody || !frontendBody) {
  console.error("Failed to locate interface AuditRecord in one of the files:");
  console.error(`  backend  ${backendFile}: ${backendBody ? "found" : "NOT FOUND"}`);
  console.error(`  frontend ${frontendFile}: ${frontendBody ? "found" : "NOT FOUND"}`);
  process.exit(1);
}

const backendFields = parseFields(backendBody);
const frontendFields = parseFields(frontendBody);

// ─── Compare ──────────────────────────────────────────────────────────────

const missingInFrontend = []; // backend has, frontend doesn't
const missingInBackend = []; // frontend has, backend doesn't
const typeMismatch = []; // both have but types differ

for (const [name, type] of backendFields) {
  if (!frontendFields.has(name)) {
    missingInFrontend.push({ name, type });
  } else if (frontendFields.get(name) !== type) {
    typeMismatch.push({ name, backend: type, frontend: frontendFields.get(name) });
  }
}
for (const [name, type] of frontendFields) {
  if (!backendFields.has(name)) {
    missingInBackend.push({ name, type });
  }
}

const total = missingInFrontend.length + missingInBackend.length + typeMismatch.length;

console.log(`AuditRecord shape check: backend=${backendFields.size} fields, frontend=${frontendFields.size} fields`);

if (total === 0) {
  console.log("\n✓ Clean — interface shapes match.");
  process.exit(0);
}

console.log(`\n✗ ${total} divergence(s):\n`);

if (missingInFrontend.length > 0) {
  console.log(`Backend ships these but frontend doesn't declare them (frontend silently drops):`);
  for (const f of missingInFrontend) console.log(`    ${f.name}: ${f.type}`);
  console.log("");
}
if (missingInBackend.length > 0) {
  console.log(`Frontend declares these but backend doesn't ship them (frontend will read undefined):`);
  for (const f of missingInBackend) console.log(`    ${f.name}: ${f.type}`);
  console.log("");
}
if (typeMismatch.length > 0) {
  console.log(`Type mismatches (same name, different shape):`);
  for (const f of typeMismatch) {
    console.log(`    ${f.name}`);
    console.log(`      backend:  ${f.backend}`);
    console.log(`      frontend: ${f.frontend}`);
  }
  console.log("");
}

console.error("Update strale-frontend/src/lib/compliance-types.ts to match the backend's AuditRecord interface.");
console.error("Both repos commit the type definition; this script just enforces they agree.");
process.exit(1);
