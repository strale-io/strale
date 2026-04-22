#!/usr/bin/env node
/**
 * Framework-package integrity check.
 *
 * The rule: every `packages/<name>-strale/` directory (or
 * `packages/<name>/`) that carries a framework-specific name MUST contain
 * at least one real import statement from the framework it claims to
 * integrate with. Anything else is a "hollow package" — a client-only
 * wrapper with a framework-named wrapper that misleads users.
 *
 * Background: on 2026-04-21 the pydantic-ai maintainer DouweM closed the
 * strale docs PR with "Shame on you" after discovering that the published
 * `pydantic-ai-strale` package contained zero pydantic-ai integration
 * code. Two other packages (google-adk-strale, openai-agents-strale)
 * had the same gap. This check exists so that specific class of error
 * cannot ship again.
 *
 * Exit 0 = clean, exit 1 = at least one package fails the contract.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "packages";

// Interim allowlist: packages known to be hollow pending Petter's disposition
// choice (yank / rename / deprecate) per YANK_LIST.md. Remove from this list
// as each is resolved. Hard expiry: 2026-05-06 — after which this script
// will fail CI regardless of allowlist membership.
const ALLOWLIST_UNTIL = "2026-05-06";
const KNOWN_HOLLOW_ALLOWLIST = new Set([
  "pydantic-ai-strale",
  "google-adk-strale",
  "openai-agents-strale",
]);

// Each entry: { packagePrefix, frameworkImportPatterns }
// packagePrefix — directory name prefix that implies a framework
// frameworkImportPatterns — regex list; at least one must match in module code
//
// CRITICAL: all regex must anchor to line-start (^) with no leading whitespace
// so that imports inside docstrings / example blocks (always indented) don't
// satisfy the check. The 2026-04-21 incident was missed because hollow
// packages had the framework import inside the module's module-level
// docstring — visually present but not executable.
const FRAMEWORK_RULES = [
  {
    dirMatch: /^langchain-strale$/,
    imports: [/^from\s+langchain(?:_core|_community)?[\.\w]*\s+import/m],
    label: "langchain (top-level 'from langchain... import')",
  },
  {
    dirMatch: /^crewai-strale$/,
    imports: [/^from\s+crewai(?:\.\w+)*\s+import/m],
    label: "crewai (top-level 'from crewai... import')",
  },
  {
    dirMatch: /^composio-strale$/,
    // Composio uses a register-based API pattern, not subclass-based.
    // Either (a) top-level `from composio import` OR (b) evidence of
    // calling composio's decorator/register surface on a passed-in instance.
    imports: [
      /^from\s+composio\s+import/m,
      /composio\.tools\.(?:custom_tool|register|get|execute)/,
    ],
    label: "composio (top-level 'from composio import' or call to composio.tools.*)",
  },
  {
    dirMatch: /^pydantic-ai-strale$/,
    imports: [/^from\s+pydantic_ai[\.\w]*\s+import/m],
    label: "pydantic-ai (top-level 'from pydantic_ai... import')",
  },
  {
    dirMatch: /^google-adk-strale$/,
    imports: [/^from\s+google\.adk[\.\w]*\s+import/m, /^from\s+google_adk[\.\w]*\s+import/m],
    label: "google-adk (top-level 'from google.adk... import' or 'from google_adk... import')",
  },
  {
    dirMatch: /^openai-agents-strale$/,
    imports: [/^from\s+openai_agents[\.\w]*\s+import/m, /^from\s+agents[\.\w]*\s+import/m],
    label: "openai-agents (top-level 'from openai_agents... import' or 'from agents... import')",
  },
  {
    dirMatch: /^semantic-kernel-strale$/,
    imports: [/^import[\s\S]{0,200}from\s+["']semantic-kernel["']/m],
    label: "semantic-kernel (top-level TS import from 'semantic-kernel')",
  },
];

/** Recursively walk a dir collecting source files. */
function collectSources(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    // Skip noise
    if (
      name === "__pycache__" ||
      name === "node_modules" ||
      name === "dist" ||
      name === "build" ||
      name === ".venv" ||
      name === "tests" ||
      name.endsWith(".egg-info")
    ) {
      continue;
    }
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...collectSources(full));
    } else if (
      name.endsWith(".py") ||
      name.endsWith(".ts") ||
      name.endsWith(".js") ||
      name.endsWith(".mjs")
    ) {
      out.push(full);
    }
  }
  return out;
}

const failures = [];
let checked = 0;

let packages;
try {
  packages = readdirSync(ROOT);
} catch {
  console.error(`framework-packages check: ${ROOT}/ not found`);
  process.exit(2);
}

for (const pkg of packages) {
  const rule = FRAMEWORK_RULES.find((r) => r.dirMatch.test(pkg));
  if (!rule) continue;
  checked++;
  const pkgDir = join(ROOT, pkg);
  const sources = collectSources(pkgDir);
  let matched = false;
  let matchedFile = null;
  outer: for (const src of sources) {
    let text;
    try {
      text = readFileSync(src, "utf-8");
    } catch {
      continue;
    }
    for (const re of rule.imports) {
      if (re.test(text)) {
        matched = true;
        matchedFile = src;
        break outer;
      }
    }
  }
  if (matched) {
    console.log(`ok    ${pkg}  (import found in ${matchedFile.replace(/\\/g, "/")})`);
  } else {
    failures.push({ pkg, label: rule.label, sources: sources.length });
  }
}

if (checked === 0) {
  console.log(
    "framework-packages check: no packages matched any framework rule — nothing to verify.",
  );
  process.exit(0);
}

// Partition failures into allowlisted (warn) vs hard-fail (exit 1).
const now = new Date().toISOString().slice(0, 10);
const allowlistExpired = now >= ALLOWLIST_UNTIL;
const allowlistedFailures = allowlistExpired
  ? []
  : failures.filter((f) => KNOWN_HOLLOW_ALLOWLIST.has(f.pkg));
const hardFailures = failures.filter(
  (f) => !KNOWN_HOLLOW_ALLOWLIST.has(f.pkg) || allowlistExpired,
);

if (allowlistedFailures.length > 0) {
  console.warn(
    `\nframework-packages check: ${allowlistedFailures.length} known-hollow package(s) on allowlist until ${ALLOWLIST_UNTIL}. See YANK_LIST.md — these must be yanked / renamed / deprecated by that date or CI will start failing.`,
  );
  for (const f of allowlistedFailures) {
    console.warn(`  warn  ${f.pkg}  (hollow — allowlisted pending yank)`);
  }
}

if (hardFailures.length === 0) {
  if (failures.length === 0) {
    console.log(
      `\nframework-packages check: ${checked} package(s) verified — every framework-named package imports from the framework it claims.`,
    );
  }
  process.exit(0);
}

console.error(
  `\nframework-packages check FAILED: ${hardFailures.length} of ${checked} package(s) do not import from the framework implied by their name (allowlist ${allowlistExpired ? "EXPIRED" : "excluded"}).\n\n` +
    `A package named 'X-strale' must contain at least one 'from X import ...' (or equivalent) in its source tree.\n` +
    `Packages that don't satisfy this are misleading: their name promises framework integration that the code doesn't deliver.\n` +
    `See the 2026-04-21 pydantic-ai incident in CONTAINMENT_REPORT.md for why this rule exists.\n\nOffenders:`,
);
for (const f of hardFailures) {
  console.error(`  ${f.pkg}`);
  console.error(`    expected: ${f.label}`);
  console.error(`    scanned ${f.sources} source file(s); no matching import found.`);
}
console.error(
  "\nTo fix:\n" +
    "  1. Implement the framework's expected primitive (Toolset/BaseTool/Plugin/etc.) with a real import from the framework, OR\n" +
    "  2. Rename the package so its name no longer claims framework integration (e.g. 'strale-client-py'), OR\n" +
    "  3. Remove the package if the honest integration path is the MCP server at https://api.strale.io/mcp.",
);
process.exit(1);
