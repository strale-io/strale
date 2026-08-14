// Money-integrity CI lint (2026-08-12, hardened per review H-3): a capability
// that reads a CALLER-SUPPLIED URL must not fetch it with raw `fetch()`. Raw
// fetch has no SSRF re-validation and no per-source ToS gate — ten executors
// shipped as blocklist side doors before this guard existed.
//
// Soundness note (the first version's defect): the check is PER CALL SITE,
// not per file — a file that uses safeFetch on one line and raw fetch on
// another is an offender (linkedin-url-validate shipped exactly that shape).
//
// Rule: in src/capabilities/*.ts (top level), if the file reads caller-URL
// input fields, every raw `fetch(` line is an offense unless the line carries
// an explicit `// unguarded-fetch-ok: <reason>` marker (for calls whose URL
// is provably constrained to a fixed host by adjacent code).
//
// Exit codes: 0 clean, 1 offender(s).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const CAPS_DIR = resolve(import.meta.dirname, "../src/capabilities");
const URL_INPUT_RE = /input\.(url|link|image_url|website|page_url|target_url|site|domain|feed_url|sitemap_url)\b|const\s*\{\s*url\s*[},]/;
const RAW_FETCH_LINE_RE = /(?:await|return|void|=|\(|,)\s*fetch\s*\(/;
const OK_MARKER = "unguarded-fetch-ok:";

const offenders = [];
for (const entry of readdirSync(CAPS_DIR)) {
  const full = join(CAPS_DIR, entry);
  if (statSync(full).isDirectory()) continue; // lib/providers gate centrally in web-provider/safe-fetch
  if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
  const content = readFileSync(full, "utf8");
  if (!URL_INPUT_RE.test(content)) continue;
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (!RAW_FETCH_LINE_RE.test(line)) return;
    if (line.includes("safeFetch")) return;
    // template/codegen strings that merely CONTAIN the word fetch (http-to-curl)
    if (/`|"const response|'const response/.test(line) && !/await\s*fetch\s*\(/.test(line)) return;
    if (line.includes(OK_MARKER) || (lines[i - 1] ?? "").includes(OK_MARKER)) return;
    offenders.push(`${entry}:${i + 1}  ${line.trim().slice(0, 90)}`);
  });
}

if (offenders.length === 0) {
  console.log("[lint] user-URL fetch guard: every raw fetch in caller-URL capabilities is guarded or marked.");
  process.exit(0);
}
console.error("[lint] Raw fetch() call sites in caller-URL capabilities without safeFetch or an ok-marker:");
for (const f of offenders) console.error(`  - ${f}`);
console.error("[lint] Use safeFetch (SSRF + ToS gate), assertTargetAllowed(url) before vendor/");
console.error("[lint] Browserless forwarding, or `// unguarded-fetch-ok: <reason>` on the line above");
console.error("[lint] ONLY when adjacent code provably constrains the URL to a fixed host.");
process.exit(1);
